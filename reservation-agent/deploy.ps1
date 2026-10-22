# Reservation relay (Travel Planner <-> Gmail <-> Muse) - Cloud Run Job, every 10 minutes.
#
# First time:
#   1. py -3 -m venv venv; venv\Scripts\activate; pip install -r requirements.txt
#   2. py -3 authorize.py          (browser sign-in as jj940170@gmail.com -> token_muse.json)
#   3. .\deploy.ps1
#
# Runs in for-claude-492207 (which has billing; the Firebase project does not)
# and reaches Firestore in travel-planner-cf0d4 through a cross-project grant.

$Project   = "for-claude-492207"
$Firestore = "travel-planner-cf0d4"
$Region    = "asia-east1"
$SAName    = "travel-reservations"
$SA        = "$SAName@$Project.iam.gserviceaccount.com"
$Job       = "travel-reservations"
$Image     = "$Region-docker.pkg.dev/$Project/travel-planner/reservations"

# Service account, dedicated so its Firestore grant reaches nothing else.
$null = gcloud iam service-accounts describe $SA --project=$Project 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "-> Creating service account $SA ..."
    gcloud iam service-accounts create $SAName --display-name="Travel Planner reservations" --project=$Project
}
Write-Host "-> Granting Firestore access on $Firestore ..."
gcloud projects add-iam-policy-binding $Firestore --member="serviceAccount:$SA" --role="roles/datastore.user" --condition=None | Out-Null
Write-Host "-> Granting run.invoker (Cloud Scheduler triggers the job as this SA) ..."
gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$SA" --role="roles/run.invoker" --condition=None | Out-Null

# Secrets. Values are piped in, never echoed.
function Set-Secret($Name, $Value) {
    $null = gcloud secrets describe $Name --project=$Project 2>$null
    if ($LASTEXITCODE -ne 0) {
        gcloud secrets create $Name --replication-policy=automatic --project=$Project | Out-Null
    }
    # Via a temp file: piping from PowerShell 5.1 prepends a UTF-8 BOM, which
    # json.loads rejects on the Cloud Run side.
    $Tmp = New-TemporaryFile
    [IO.File]::WriteAllText($Tmp.FullName, $Value, (New-Object System.Text.UTF8Encoding $false))
    gcloud secrets versions add $Name --data-file="$($Tmp.FullName)" --project=$Project | Out-Null
    Remove-Item $Tmp
    gcloud secrets add-iam-policy-binding $Name --member="serviceAccount:$SA" `
        --role="roles/secretmanager.secretAccessor" --project=$Project | Out-Null
}
if (-not (Test-Path "token_muse.json")) { Write-Error "token_muse.json missing - run py -3 authorize.py first"; exit 1 }
Write-Host "-> Storing Gmail token in Secret Manager ..."
Set-Secret "travel-reservations-gmail-token" (Get-Content "token_muse.json" -Raw)

# Same Gemini key the web app uses (shared with cash-expense-bot - see CLAUDE.md).
$GeminiKey = (Get-Content "..\.env" | Where-Object { $_ -match '^VITE_GEMINI_API_KEY=' }) -replace '^VITE_GEMINI_API_KEY=', ''
if (-not $GeminiKey) { Write-Error "VITE_GEMINI_API_KEY not found in ..\.env"; exit 1 }
Write-Host "-> Storing Gemini key in Secret Manager ..."
Set-Secret "travel-reservations-gemini-key" $GeminiKey.Trim()

# Image
$null = gcloud artifacts repositories describe travel-planner --location=$Region --project=$Project 2>$null
if ($LASTEXITCODE -ne 0) {
    gcloud artifacts repositories create travel-planner --repository-format=docker --location=$Region --project=$Project
}
Write-Host "-> Building image via Cloud Build ..."
gcloud builds submit . --tag=$Image --project=$Project
if ($LASTEXITCODE -ne 0) { Write-Error "Cloud Build failed"; exit 1 }

# Job
$JobArgs = @(
    "--image=$Image", "--region=$Region", "--project=$Project", "--service-account=$SA",
    "--set-secrets=GMAIL_TOKEN=travel-reservations-gmail-token:latest,GEMINI_API_KEY=travel-reservations-gemini-key:latest",
    "--set-env-vars=FIRESTORE_PROJECT=$Firestore",
    "--max-retries=0", "--task-timeout=300"
)
$null = gcloud run jobs describe $Job --region=$Region --project=$Project 2>$null
if ($LASTEXITCODE -ne 0) { gcloud run jobs create $Job @JobArgs } else { gcloud run jobs update $Job @JobArgs }
if ($LASTEXITCODE -ne 0) { Write-Error "job deploy failed"; exit 1 }

# Every 10 minutes, so a booking Muse confirms shows up in the app quickly; a
# run with no new reply and no new place costs one Gmail search and no email.
# The scheduler keeps its original "-hourly" name: renaming means recreating it.
# Time of day does not matter, so the zone is only for reading logs.
$Uri = "https://$Region-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$Project/jobs/${Job}:run"
$Cron = "$Job-hourly"
$null = gcloud scheduler jobs describe $Cron --location=$Region --project=$Project 2>$null
if ($LASTEXITCODE -ne 0) {
    gcloud scheduler jobs create http $Cron --schedule="*/10 * * * *" --time-zone="America/New_York" `
        --uri=$Uri --http-method=POST --oauth-service-account-email=$SA --location=$Region --project=$Project
} else {
    gcloud scheduler jobs update http $Cron --schedule="*/10 * * * *" --time-zone="America/New_York" `
        --uri=$Uri --oauth-service-account-email=$SA --location=$Region --project=$Project
}

Write-Host ""
Write-Host "=== Deployed: $Job runs every 10 minutes ==="
Write-Host "Run now:  gcloud run jobs execute $Job --region=$Region --project=$Project"
