"""
One-time: authorize Gmail send + read for the reservation relay.

    py -3 authorize.py

Opens a browser to sign in as jj940170@gmail.com and approve "send email" and
"read email". Reuses the OAuth client from personal-finance and writes
token_muse.json next to this file (gitignored). deploy.ps1 then stores it in
Secret Manager. Kept separate from personal-finance's tokens so revoking one
never breaks the other.
"""

from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

from main import SCOPES, TOKEN_FILE

CLIENT = Path(__file__).resolve().parents[2] / "personal-finance" / "gmail-downloader" / "credentials.json"

if __name__ == "__main__":
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"Saved {TOKEN_FILE}")
