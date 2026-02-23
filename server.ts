import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("travel.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    country TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    activity TEXT,
    map_url TEXT,
    note TEXT,
    is_flight INTEGER DEFAULT 0,
    travel_mode TEXT DEFAULT 'transit',
    FOREIGN KEY(trip_id) REFERENCES trips(id)
  );

  CREATE TABLE IF NOT EXISTS accommodations (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    name TEXT,
    address TEXT,
    check_in TEXT,
    check_out TEXT,
    map_url TEXT,
    FOREIGN KEY(trip_id) REFERENCES trips(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    description TEXT,
    category TEXT,
    amount REAL,
    currency TEXT,
    date TEXT,
    FOREIGN KEY(trip_id) REFERENCES trips(id)
  );

  CREATE TABLE IF NOT EXISTS checklist (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    item TEXT,
    is_checked INTEGER DEFAULT 0,
    FOREIGN KEY(trip_id) REFERENCES trips(id)
  );
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  app.use(express.json());

  // API Routes
  app.get("/api/trips", (req, res) => {
    const trips = db.prepare("SELECT * FROM trips ORDER BY created_at DESC").all();
    res.json(trips);
  });

  app.post("/api/trips", (req, res) => {
    const { id, name, start_date, end_date, country } = req.body;
    db.prepare("INSERT INTO trips (id, name, start_date, end_date, country) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, start_date, end_date, country);
    res.json({ status: "ok" });
  });

  app.get("/api/trips/:id/activities", (req, res) => {
    const activities = db.prepare("SELECT * FROM activities WHERE trip_id = ? ORDER BY date, start_time").all(req.params.id);
    res.json(activities);
  });

  app.post("/api/activities", (req, res) => {
    const { id, trip_id, date, start_time, end_time, activity, map_url, note, is_flight, travel_mode } = req.body;
    db.prepare("INSERT INTO activities (id, trip_id, date, start_time, end_time, activity, map_url, note, is_flight, travel_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, trip_id, date, start_time, end_time, activity, map_url, note, is_flight ? 1 : 0, travel_mode || 'transit');
    
    // Broadcast update
    io.to(trip_id).emit("activity_updated");
    res.json({ status: "ok" });
  });

  app.get("/api/trips/:id/accommodations", (req, res) => {
    const accommodations = db.prepare("SELECT * FROM accommodations WHERE trip_id = ?").all(req.params.id);
    res.json(accommodations);
  });

  app.post("/api/accommodations", (req, res) => {
    const { id, trip_id, name, address, check_in, check_out, map_url } = req.body;
    db.prepare("INSERT INTO accommodations (id, trip_id, name, address, check_in, check_out, map_url) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, trip_id, name, address, check_in, check_out, map_url);
    
    io.to(trip_id).emit("accommodation_updated");
    res.json({ status: "ok" });
  });

  app.get("/api/trips/:id/expenses", (req, res) => {
    const expenses = db.prepare("SELECT * FROM expenses WHERE trip_id = ?").all(req.params.id);
    res.json(expenses);
  });

  app.post("/api/expenses", (req, res) => {
    const { id, trip_id, description, category, amount, currency, date } = req.body;
    db.prepare("INSERT INTO expenses (id, trip_id, description, category, amount, currency, date) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, trip_id, description, category, amount, currency, date);
    
    io.to(trip_id).emit("expense_updated");
    res.json({ status: "ok" });
  });

  app.delete("/api/activities/:id", (req, res) => {
    const activity = db.prepare("SELECT trip_id FROM activities WHERE id = ?").get(req.params.id) as any;
    if (activity) {
      db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
      io.to(activity.trip_id).emit("activity_updated");
    }
    res.json({ status: "ok" });
  });

  app.put("/api/activities/:id", (req, res) => {
    const { start_time, end_time, activity, map_url, note, travel_mode } = req.body;
    db.prepare("UPDATE activities SET start_time = ?, end_time = ?, activity = ?, map_url = ?, note = ?, travel_mode = ? WHERE id = ?")
      .run(start_time, end_time, activity, map_url, note, travel_mode, req.params.id);
    
    const act = db.prepare("SELECT trip_id FROM activities WHERE id = ?").get(req.params.id) as any;
    if (act) {
      io.to(act.trip_id).emit("activity_updated");
    }
    res.json({ status: "ok" });
  });

  app.delete("/api/accommodations/:id", (req, res) => {
    const acc = db.prepare("SELECT trip_id FROM accommodations WHERE id = ?").get(req.params.id) as any;
    if (acc) {
      db.prepare("DELETE FROM accommodations WHERE id = ?").run(req.params.id);
      io.to(acc.trip_id).emit("accommodation_updated");
    }
    res.json({ status: "ok" });
  });

  app.delete("/api/expenses/:id", (req, res) => {
    const expense = db.prepare("SELECT trip_id FROM expenses WHERE id = ?").get(req.params.id) as any;
    if (expense) {
      db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id);
      io.to(expense.trip_id).emit("expense_updated");
    }
    res.json({ status: "ok" });
  });

  app.delete("/api/trips/:id", (req, res) => {
    db.prepare("DELETE FROM trips WHERE id = ?").run(req.params.id);
    db.prepare("DELETE FROM activities WHERE trip_id = ?").run(req.params.id);
    db.prepare("DELETE FROM accommodations WHERE trip_id = ?").run(req.params.id);
    db.prepare("DELETE FROM expenses WHERE trip_id = ?").run(req.params.id);
    db.prepare("DELETE FROM checklist WHERE trip_id = ?").run(req.params.id);
    res.json({ status: "ok" });
  });

  app.get("/api/trips/:id/checklist", (req, res) => {
    const checklist = db.prepare("SELECT * FROM checklist WHERE trip_id = ?").all(req.params.id);
    res.json(checklist);
  });

  app.post("/api/checklist", (req, res) => {
    const { id, trip_id, item } = req.body;
    db.prepare("INSERT INTO checklist (id, trip_id, item) VALUES (?, ?, ?)").run(id, trip_id, item);
    io.to(trip_id).emit("checklist_updated");
    res.json({ status: "ok" });
  });

  app.put("/api/checklist/:id", (req, res) => {
    const { is_checked } = req.body;
    db.prepare("UPDATE checklist SET is_checked = ? WHERE id = ?").run(is_checked ? 1 : 0, req.params.id);
    const item = db.prepare("SELECT trip_id FROM checklist WHERE id = ?").get(req.params.id) as any;
    if (item) {
      io.to(item.trip_id).emit("checklist_updated");
    }
    res.json({ status: "ok" });
  });

  app.delete("/api/checklist/:id", (req, res) => {
    const item = db.prepare("SELECT trip_id FROM checklist WHERE id = ?").get(req.params.id) as any;
    if (item) {
      db.prepare("DELETE FROM checklist WHERE id = ?").run(req.params.id);
      io.to(item.trip_id).emit("checklist_updated");
    }
    res.json({ status: "ok" });
  });

  // app.get("/api/travel-time", async (req, res) => {
  //   const { origin, destination, mode } = req.query;
  //   const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  //
  //   if (!apiKey) {
  //     return res.json({ duration: "需設定 API Key", distance: "" });
  //   }
  //
  //   try {
  //     const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin as string)}&destinations=${encodeURIComponent(destination as string)}&mode=${mode || 'transit'}&language=zh-TW&key=${apiKey}`;
  //     const response = await fetch(url);
  //     const data = await response.json();
  //
  //     if (data.status === 'OK') {
  //       const element = data.rows[0].elements[0];
  //       if (element.status === 'OK') {
  //         return res.json({
  //           duration: element.duration.text,
  //           distance: element.distance.text
  //         });
  //       }
  //     }
  //     res.json({ duration: "無法計算", distance: "" });
  //   } catch (error) {
  //     res.status(500).json({ error: "API Error" });
  //   }
  // });

  app.post("/api/send-itinerary", async (req, res) => {
    const { email, tripName, pdfBase64 } = req.body;

    // Use ethereal for demo/testing if no real credentials provided
    // In a real app, use process.env.SMTP_HOST, etc.
    try {
      let transporter;
      
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: parseInt(process.env.SMTP_PORT || "465"),
          secure: true,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      } else {
        // Fallback to Ethereal for testing
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      }

      const mailOptions = {
        from: `"AI Travel Planner" <${process.env.SMTP_USER || "noreply@example.com"}>`,
        to: email,
        subject: `您的旅程行程表: ${tripName}`,
        text: `您好，這是您在 AI Travel Planner 規劃的行程表：${tripName}。請查收附件。`,
        attachments: [
          {
            filename: `${tripName}_行程表.pdf`,
            content: pdfBase64,
            encoding: 'base64'
          }
        ]
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("Message sent: %s", info.messageId);
      
      if (!process.env.SMTP_USER) {
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
      }

      res.json({ status: "ok" });
    } catch (error) {
      console.error("Email error:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Socket.io for real-time collaboration
  io.on("connection", (socket) => {
    socket.on("join_trip", (tripId) => {
      socket.join(tripId);
      console.log(`User joined trip: ${tripId}`);
    });

    socket.on("leave_trip", (tripId) => {
      socket.leave(tripId);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
