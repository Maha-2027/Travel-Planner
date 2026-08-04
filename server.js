const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, 'travel-planner', 'travel-planner', '.env') });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const authRoutesFactory = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'travel-planner', 'travel-planner', 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'travel-planner-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── Database Pool ────────────────────────────────────────────────────────────
let db;
async function initDB() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, 'travel-planner', 'travel-planner', 'db', 'travel_planner.db');
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ SQLite connection error:', err.message);
        reject(err);
        return;
      }
      console.log('✅ SQLite connected successfully');

      // Create tables if they don't exist
      const schemaPath = path.join(__dirname, 'travel-planner', 'travel-planner', 'db', 'schema.sql');
      const fs = require('fs');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      // Use the schema as-is (already SQLite compatible)
      const sqliteSchema = schema;

      db.exec(sqliteSchema, (err) => {
        if (err) {
          console.error('❌ Error creating tables:', err.message);
          reject(err);
        } else {
          console.log('✅ Database tables created/verified');

          // Ensure refunds table exists for tracking scheduled refunds
          db.run(`CREATE TABLE IF NOT EXISTS refunds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_id INTEGER,
            amount REAL,
            currency TEXT,
            scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expected_refund_at DATETIME,
            processed INTEGER DEFAULT 0
          )`, [], (refundErr) => {
            if (refundErr) console.warn('⚠️  Failed to ensure refunds table:', refundErr.message);
          });

          // Seed destinations if table is empty
          db.get('SELECT COUNT(*) as count FROM destinations', [], (err, row) => {
            if (err) {
              console.error('❌ Error checking destinations count:', err.message);
            } else if (row.count === 0) {
              console.log('🌱 Seeding destinations data...');
              const insertStmt = db.prepare(`
                INSERT INTO destinations (id, name, country, short_desc, image_url, avg_cost_usd, best_season, category, rating)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);

              mockDestinations.forEach(dest => {
                insertStmt.run([
                  dest.id,
                  dest.name,
                  dest.country,
                  dest.short_desc,
                  dest.image_url,
                  dest.avg_cost_usd,
                  dest.best_season,
                  dest.category,
                  dest.rating
                ]);
              });

              insertStmt.finalize();
              console.log('✅ Destinations seeded successfully');
            }
            migrateTravelPlansSchema().then(() => resolve(true)).catch(reject);
          });
        }
      });
    });
  });
}

function migrateTravelPlansSchema() {
  return new Promise((resolve, reject) => {
    db.all("PRAGMA table_info('travel_plans')", [], (err, rows) => {
      if (err) return reject(err);
      const existingColumns = rows.map(r => r.name);
      const requiredColumns = [
        { name: 'destination_id', ddl: 'INTEGER' },
        { name: 'accommodation_stars', ddl: "INTEGER DEFAULT 3" },
        { name: 'car_type', ddl: 'TEXT' },
        { name: 'food_preference', ddl: "TEXT DEFAULT 'mixed'" },
        { name: 'payment_method', ddl: "TEXT DEFAULT 'credit_card'" },
        { name: 'currency', ddl: "TEXT DEFAULT 'USD'" },
        { name: 'status', ddl: "TEXT DEFAULT 'draft'" }
      ];

      const missing = requiredColumns.filter(col => !existingColumns.includes(col.name));
      if (missing.length === 0) return resolve();

      let completed = 0;
      missing.forEach(col => {
        db.run(`ALTER TABLE travel_plans ADD COLUMN ${col.name} ${col.ddl}`, [], (alterErr) => {
          if (alterErr) return reject(alterErr);
          completed += 1;
          if (completed === missing.length) resolve();
        });
      });
    });
  });
}

// ─── Email Setup ─────────────────────────────────────────────────────────────
let emailTransporter = null;

function getEmailTransporter() {
  if (!emailTransporter && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log('🔧 Initializing email transporter...');
    console.log('📧 SMTP_HOST:', process.env.SMTP_HOST);
    console.log('📧 SMTP_PORT:', process.env.SMTP_PORT);
    console.log('📧 SMTP_USER:', process.env.SMTP_USER ? '✓ Set' : '✗ Not set');
    console.log('📧 SMTP_PASS:', process.env.SMTP_PASS ? '✓ Set' : '✗ Not set');
    
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    console.log('✅ Email transporter initialized');
  } else if (!emailTransporter) {
    console.warn('⚠️  SMTP not configured. Missing:', {
      SMTP_HOST: !!process.env.SMTP_HOST,
      SMTP_USER: !!process.env.SMTP_USER,
      SMTP_PASS: !!process.env.SMTP_PASS
    });
  }
  return emailTransporter;
}

// ─── Currency helpers (mirrors app.js FX_RATES) ──────────────────────────────
const FX_RATES = {
  USD: { rate: 1,       symbol: '$',   name: 'US Dollar' },
  EUR: { rate: 0.92,    symbol: '€',   name: 'Euro' },
  GBP: { rate: 0.79,    symbol: '£',   name: 'British Pound' },
  INR: { rate: 83.12,   symbol: '₹',   name: 'Indian Rupee' },
  JPY: { rate: 149.50,  symbol: '¥',   name: 'Japanese Yen' },
  AUD: { rate: 1.53,    symbol: 'A$',  name: 'Australian Dollar' },
  CAD: { rate: 1.36,    symbol: 'C$',  name: 'Canadian Dollar' },
  SGD: { rate: 1.34,    symbol: 'S$',  name: 'Singapore Dollar' },
  AED: { rate: 3.67,    symbol: 'د.إ', name: 'UAE Dirham' },
  THB: { rate: 35.20,   symbol: '฿',   name: 'Thai Baht' },
};

/**
 * Convert a USD amount to the plan's chosen currency and return a
 * display string like "₹61,509" or "$740".
 */
function formatBudgetForEmail(totalUsd, currency) {
  const fx = FX_RATES[currency] || FX_RATES.USD;
  const converted = Math.round((totalUsd || 0) * fx.rate);
  return `${fx.symbol}${converted.toLocaleString('en-IN')} (${currency})`;
}

async function sendWelcomeEmail(toEmail, name) {
  console.log(`📨 Attempting to send welcome email to ${toEmail}...`);
  
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn('⚠️  Email not sent: SMTP is not configured.');
    return false;
  }

  const subject = `✨ Welcome to Wanderlust, ${name}! Your adventure begins now 🌍`;
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  const text = `Hi ${name},\n\nWelcome to Wanderlust! Your account is ready, and you can now start planning amazing trips.\n\nHappy travels,\nThe Wanderlust Team`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2a7a3b; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">🧭 Wanderlust</h1>
        <p style="color: #718096; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px;">Your Personal Travel Companion</p>
      </div>
      
      <div style="font-size: 16px; line-height: 1.6; color: #4a5568;">
        <p style="font-size: 18px; color: #2d3748; font-weight: 600;">Hey ${name}! 👋</p>
        <p>We are absolutely thrilled to welcome you to the <strong>Wanderlust</strong> family! 🎉 Your account has been successfully created, and your next big adventure is just a few clicks away.</p>
        <p>Whether you're planning a relaxing beach escape, a bustling city tour, or a wild mountain hike, we've got you covered. 🗺️✈️</p>
        
        <div style="background-color: #f7fafc; border-left: 4px solid #2a7a3b; padding: 15px; margin: 25px 0; border-radius: 0 8px 8px 0;">
          <h4 style="margin: 0 0 5px 0; color: #2d3748;">🚀 What's Next?</h4>
          <p style="margin: 0; font-size: 14px; color: #4a5568;">Head over to the travel planner to build your custom itinerary, estimate your budget, find local activities, and book your dream trip!</p>
        </div>

        <div style="text-align: center; margin: 35px 0 25px 0;">
          <a href="${process.env.BASE_URL || 'http://localhost:3000'}/planner" style="background-color: #2a7a3b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; box-shadow: 0 4px 6px rgba(42, 122, 59, 0.2);">Start Planning Your Trip ➔</a>
        </div>
      </div>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
      
      <div style="text-align: center; font-size: 12px; color: #a0aec0; line-height: 1.5;">
        <p style="margin: 0;">Warm travel wishes,</p>
        <p style="font-weight: 600; color: #4a5568; margin: 5px 0 0 0;">✨ The Wanderlust Team ✨</p>
        <p style="margin-top: 15px; font-size: 11px;">You received this email because you signed up on Wanderlust. If you did not create an account, please ignore this email.</p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
      html
    });
    console.log('✅ Welcome email sent successfully:', info.messageId);
    return true;
  } catch (err) {
    console.error('❌ Failed to send welcome email:', err.message);
    return false;
  }
}

async function sendTripConfirmationEmail(toEmail, name, plan) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn('⚠️  Trip confirmation email not sent: SMTP is not configured.');
    return false;
  }

  const subject = `🎉 Pack your bags! Your trip to ${plan.destination_name} is CONFIRMED ✈️`;
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  const budgetDisplay = plan.total_budget_usd
    ? formatBudgetForEmail(plan.total_budget_usd, plan.currency || 'USD')
    : 'N/A';
  const text = `Hi ${name},\n\nYour travel plan is confirmed! Here are the details:\n\nDestination: ${plan.destination_name || 'N/A'}\nDeparture: ${plan.departure_city || 'N/A'}\nDates: ${plan.travel_date || 'N/A'} → ${plan.return_date || 'N/A'}\nTravelers: ${plan.travelers || 1}\nAccommodation: ${plan.accommodation_type || 'hotel'} ${plan.accommodation_stars ? `(${plan.accommodation_stars}★)` : ''}\nFlight class: ${plan.flight_class || 'economy'}\nCar rental: ${plan.car_rental ? `Yes — ${plan.car_type || 'economy'}` : 'No'}\nEstimated Budget: ${budgetDisplay}\n\nThank you for choosing Wanderlust!\n\nHappy travels,\nThe Wanderlust Team`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 25px;">
        <div style="font-size: 50px; margin-bottom: 10px;">🎉</div>
        <h1 style="color: #2a7a3b; margin: 0; font-size: 26px; font-weight: 700;">Trip Confirmed!</h1>
        <p style="color: #718096; margin: 5px 0 0 0; font-size: 15px;">Wanderlust Trip Details for <strong>${plan.destination_name}</strong></p>
      </div>

      <div style="font-size: 16px; line-height: 1.6; color: #4a5568;">
        <p style="font-size: 18px; color: #2d3748; font-weight: 600;">Hi ${name}, 👋</p>
        <p>It's official! Your travel plans are locked in and confirmed. ✈️ Get ready to make unforgettable memories in <strong>${plan.destination_name}</strong>!</p>
        
        <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; margin-bottom: 15px; color: #2d3748; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">🗺️ Itinerary Overview</h3>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568; width: 40%;">📍 Destination</td>
              <td style="padding: 8px 0; color: #1a202c; font-weight: 700;">${plan.destination_name || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">🛫 Departure From</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.departure_city || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">📅 Travel Dates</td>
              <td style="padding: 8px 0; color: #1a202c; font-weight: 600; color: #2a7a3b;">${plan.travel_date || 'N/A'} ➔ ${plan.return_date || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">👥 Travelers</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.travelers || 1} Person(s)</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">🏨 Accommodation</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.accommodation_type || 'hotel'} ${plan.accommodation_stars ? `(${plan.accommodation_stars}★)` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">✈️ Flight Class</td>
              <td style="padding: 8px 0; color: #1a202c; text-transform: capitalize;">${plan.flight_class || 'economy'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">🚗 Car Rental</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.car_rental ? `Yes — ${plan.car_type || 'Economy'}` : 'No'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">💰 Estimated Budget</td>
              <td style="padding: 8px 0; color: #2a7a3b; font-weight: 700; font-size: 16px;">${budgetDisplay}</td>
            </tr>
          </table>
        </div>

        ${plan.notes ? `
        <div style="background-color: #fffaf0; border-left: 4px solid #dd6b20; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <h4 style="margin: 0 0 5px 0; color: #dd6b20; font-size: 14px;">📝 Notes</h4>
          <p style="margin: 0; font-size: 13px; color: #744210;">${plan.notes}</p>
        </div>
        ` : ''}

        <p style="margin-top: 25px;">You can view and manage this trip, download invoices, and see your maps anytime by visiting your account dashboard.</p>
        
        <div style="text-align: center; margin: 30px 0 15px 0;">
          <a href="${process.env.BASE_URL || 'http://localhost:3000'}/account#booked" style="background-color: #2a7a3b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">View Saved Trips ➔</a>
        </div>
      </div>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">

      <div style="text-align: center; font-size: 12px; color: #a0aec0; line-height: 1.5;">
        <p style="margin: 0;">Thank you for planning with Wanderlust!</p>
        <p style="font-weight: 600; color: #4a5568; margin: 5px 0 0 0;">🌴 The Wanderlust Team 🌴</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html
  });
  return true;
}

async function sendTripCancellationEmail(toEmail, name, plan) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn('⚠️  Trip cancellation email not sent: SMTP is not configured.');
    return false;
  }

  const subject = `🚫 Your trip to ${plan.destination_name || 'your destination'} has been cancelled`;
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  const refundEstimate = plan.total_budget_usd ? formatBudgetForEmail(plan.total_budget_usd, plan.currency || 'USD') : 'N/A';
  const text = `Hi ${name},\n\nYour booking for ${plan.destination_name || 'your trip'} has been cancelled. The refund of ${refundEstimate} will be processed and should reach your original payment method within 24 hours.\n\nWe're sorry for the inconvenience.\n\n— The Wanderlust Team`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #e53e3e; margin: 0; font-size: 24px;">Booking Cancelled</h1>
        <p style="color: #718096; margin: 5px 0 0 0;">Your refund will be processed within 24 hours.</p>
      </div>
      <div style="font-size: 15px; color: #4a5568; line-height: 1.6;">
        <p>Hi ${name},</p>
        <p>Your booking for <strong>${plan.destination_name || 'your trip'}</strong> (dates: ${plan.travel_date || 'N/A'} → ${plan.return_date || 'N/A'}) has been cancelled and removed from your account.</p>
        <p>Refund amount: <strong>${refundEstimate}</strong></p>
        <p>The refund will be returned to your original payment method and should appear within 24 hours.</p>
        <p>If you have any questions, contact our support team.</p>
        <div style="text-align: center; margin-top: 20px;"><a href="${process.env.BASE_URL || 'http://localhost:3000'}/account#booked" style="background-color:#2a7a3b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">View Account</a></div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({ from, to: toEmail, subject, text, html });
    return true;
  } catch (err) {
    console.error('❌ Failed to send cancellation email:', err.message);
    return false;
  }
}

async function sendPlanSummaryEmail(toEmail, name, plan) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn('⚠️  Plan summary email not sent: SMTP is not configured.');
    return false;
  }

  const subject = `📝 Your new Wanderlust trip plan to ${plan.destination_name} is saved!`;
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  const budgetDisplay = plan.total_budget_usd
    ? formatBudgetForEmail(plan.total_budget_usd, plan.currency || 'USD')
    : 'N/A';
  const text = `Hi ${name},\n\nYour new trip plan is saved! Here are the details:\n\nDestination: ${plan.destination_name || 'N/A'}\nDeparture: ${plan.departure_city || 'N/A'}\nDates: ${plan.travel_date || 'N/A'} → ${plan.return_date || 'N/A'}\nTravelers: ${plan.travelers || 1}\nAccommodation: ${plan.accommodation_type || 'hotel'} ${plan.accommodation_stars ? `(${plan.accommodation_stars}★)` : ''}\nFlight class: ${plan.flight_class || 'economy'}\nCar rental: ${plan.car_rental ? `Yes — ${plan.car_type || 'economy'}` : 'No'}\nEstimated Budget: ${budgetDisplay}\n\nThank you for choosing Wanderlust!\n\nHappy travels,\nThe Wanderlust Team`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 25px;">
        <div style="font-size: 50px; margin-bottom: 10px;">🗺️</div>
        <h1 style="color: #2a7a3b; margin: 0; font-size: 26px; font-weight: 700;">Trip Plan Saved!</h1>
        <p style="color: #718096; margin: 5px 0 0 0; font-size: 15px;">Wanderlust Draft Itinerary for <strong>${plan.destination_name}</strong></p>
      </div>

      <div style="font-size: 16px; line-height: 1.6; color: #4a5568;">
        <p style="font-size: 18px; color: #2d3748; font-weight: 600;">Hi ${name}, 👋</p>
        <p>Your trip plan has been saved to your account. You can view, edit, or book this plan at any time!</p>
        
        <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin-top: 0; margin-bottom: 15px; color: #2d3748; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">🧭 Itinerary Summary</h3>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568; width: 40%;">📍 Destination</td>
              <td style="padding: 8px 0; color: #1a202c; font-weight: 700;">${plan.destination_name || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">🛫 Departure From</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.departure_city || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">📅 Travel Dates</td>
              <td style="padding: 8px 0; color: #1a202c; font-weight: 600; color: #2a7a3b;">${plan.travel_date || 'N/A'} ➔ ${plan.return_date || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">👥 Travelers</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.travelers || 1} Person(s)</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">🏨 Accommodation</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.accommodation_type || 'hotel'} ${plan.accommodation_stars ? `(${plan.accommodation_stars}★)` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">✈️ Flight Class</td>
              <td style="padding: 8px 0; color: #1a202c; text-transform: capitalize;">${plan.flight_class || 'economy'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">🚗 Car Rental</td>
              <td style="padding: 8px 0; color: #1a202c;">${plan.car_rental ? `Yes — ${plan.car_type || 'Economy'}` : 'No'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">💰 Estimated Budget</td>
              <td style="padding: 8px 0; color: #2a7a3b; font-weight: 700; font-size: 16px;">${budgetDisplay}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0 15px 0;">
          <a href="${process.env.BASE_URL || 'http://localhost:3000'}/account" style="background-color: #2a7a3b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">View My Saved Plans ➔</a>
        </div>
      </div>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">

      <div style="text-align: center; font-size: 12px; color: #a0aec0; line-height: 1.5;">
        <p style="margin: 0;">Thank you for planning with Wanderlust!</p>
        <p style="font-weight: 600; color: #4a5568; margin: 5px 0 0 0;">✨ The Wanderlust Team ✨</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
      html
    });
    return true;
  } catch (err) {
    console.error('❌ Failed to send plan summary email:', err.message);
    return false;
  }
}

// ─── In-memory Mock Data (fallback when MySQL is unavailable) ─────────────────
const mockUsers = [];
const mockPlans = [];
const mockDestinations = [
  { id:1, name:'Paris', country:'France', short_desc:'City of light, love & haute cuisine', image_url:'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800', avg_cost_usd:2200, best_season:'Apr–Jun, Sep–Oct', category:'city', rating:4.8 },
  { id:2, name:'Tokyo', country:'Japan', short_desc:'Where tradition meets neon-lit future', image_url:'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800', avg_cost_usd:2500, best_season:'Mar–May, Sep–Nov', category:'city', rating:4.9 },
  { id:3, name:'Bali', country:'Indonesia', short_desc:'Island of gods, temples & surf', image_url:'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800', avg_cost_usd:1200, best_season:'Apr–Oct', category:'beach', rating:4.7 },
  { id:4, name:'New York', country:'USA', short_desc:'The city that never sleeps', image_url:'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800', avg_cost_usd:3000, best_season:'Apr–Jun, Sep–Nov', category:'city', rating:4.7 },
  { id:5, name:'Cape Town', country:'South Africa', short_desc:'Where mountains meet the ocean', image_url:'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800', avg_cost_usd:1500, best_season:'Nov–Mar', category:'nature', rating:4.8 },
  { id:6, name:'Santorini', country:'Greece', short_desc:'Whitewashed cliffs & volcanic sunsets', image_url:'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800', avg_cost_usd:2800, best_season:'May–Oct', category:'beach', rating:4.9 },
  { id:7, name:'Machu Picchu', country:'Peru', short_desc:'Lost city of the Inca empire', image_url:'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800', avg_cost_usd:1800, best_season:'May–Sep', category:'adventure', rating:4.9 },
  { id:8, name:'Maldives', country:'Maldives', short_desc:'Overwater bungalows & crystal lagoons', image_url:'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800', avg_cost_usd:4500, best_season:'Nov–Apr', category:'beach', rating:4.9 },
  { id:9, name:'Safari Kenya', country:'Kenya', short_desc:'The great migration & big five', image_url:'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=800', avg_cost_usd:3500, best_season:'Jul–Oct', category:'adventure', rating:4.8 },
  { id:10, name:'Amsterdam', country:'Netherlands', short_desc:'Canals, cycling & golden age art', image_url:'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800', avg_cost_usd:1900, best_season:'Apr–Aug', category:'city', rating:4.6 }
];

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

const authRoutes = authRoutesFactory({ getDb: () => db, mockUsers, getEmailTransporter, sendWelcomeEmail });
app.use('/', authRoutes);

// ─── Destinations Routes ──────────────────────────────────────────────────────
app.get('/api/destinations', async (req, res) => {
  try {
    if (db) {
      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM destinations ORDER BY rating DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      return res.json(rows);
    }
    res.json(mockDestinations);
  } catch (err) {
    res.json(mockDestinations);
  }
});

app.get('/api/destinations/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (db) {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM destinations WHERE id = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json(row);
    }
    const dest = mockDestinations.find(d => d.id === id);
    if (!dest) return res.status(404).json({ error: 'Not found' });
    res.json(dest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch destination' });
  }
});

// ─── Plans Routes ─────────────────────────────────────────────────────────────
app.get('/api/plans', requireAuth, async (req, res) => {
  try {
    if (db) {
      const rows = await new Promise((resolve, reject) => {
        db.all(
          'SELECT tp.*, d.name as dest_name, d.image_url FROM travel_plans tp LEFT JOIN destinations d ON COALESCE(tp.destination_id, (SELECT id FROM destinations WHERE name LIKE tp.destination_name LIMIT 1)) = d.id WHERE tp.user_id = ? ORDER BY tp.created_at DESC',
          [req.session.userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
      });
      return res.json(rows);
    }
    res.json(mockPlans.filter(p => p.user_id === req.session.userId));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

app.post('/api/plans', requireAuth, async (req, res) => {
  const plan = { ...req.body, user_id: req.session.userId };
  try {
    let insertId;
    if (db) {
      const result = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO travel_plans (user_id, destination_id, destination_name, departure_city, travel_date, return_date, travelers, accommodation_type, accommodation_stars, flight_class, car_rental, car_type, food_preference, total_budget_usd, currency, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [plan.user_id, plan.destination_id||null, plan.destination_name, plan.departure_city, plan.travel_date, plan.return_date, plan.travelers||1, plan.accommodation_type||'hotel', plan.accommodation_stars||3, plan.flight_class||'economy', plan.car_rental||false, plan.car_type||null, plan.food_preference||'mixed', plan.total_budget_usd||null, plan.currency||'USD', plan.notes||null],
          function(err) {
            if (err) reject(err);
            else resolve({ insertId: this.lastID });
          });
      });
      insertId = result.insertId;
    } else {
      const id = mockPlans.length + 1;
      mockPlans.push({ id, ...plan, created_at: new Date() });
      insertId = id;
    }

    // Send trip plan summary confirmation email
    let userEmail = req.session.userEmail;
    let userName = req.session.userName;
    if (db && (!userEmail || !userName)) {
      const user = await new Promise((resolve) => {
        db.get('SELECT name, email FROM users WHERE id = ?', [req.session.userId], (err, row) => {
          resolve(row);
        });
      });
      if (user) {
        userName = user.name;
        userEmail = user.email;
      }
    }
    if (userEmail) {
      sendPlanSummaryEmail(userEmail, userName || 'Traveler', plan).catch(err => {
        console.warn('⚠️ Failed to send plan summary email:', err.message);
      });
    }

    return res.json({ success: true, id: insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save plan' });
  }
});

app.delete('/api/plans/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    let emailSent = false;
    let refundScheduled = false;

    if (db) {
      // fetch the plan first
      const plan = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM travel_plans WHERE id = ? AND user_id = ?', [id, req.session.userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (plan && plan.status === 'confirmed') {
        // schedule refund record (expected within 24 hours)
        await new Promise((resolve) => {
          db.run('INSERT INTO refunds (user_id, plan_id, amount, currency, expected_refund_at) VALUES (?, ?, ?, ?, datetime("now", "+1 day"))', [req.session.userId, id, plan.total_budget_usd || 0, plan.currency || 'USD'], function(err) {
            if (!err) refundScheduled = true;
            resolve();
          });
        });

        // determine user email/name
        let userEmail = req.session.userEmail;
        let userName = req.session.userName;
        if (!userEmail || !userName) {
          const user = await new Promise((resolve) => {
            db.get('SELECT name, email FROM users WHERE id = ?', [req.session.userId], (err, row) => resolve(row));
          });
          if (user) {
            userName = user.name;
            userEmail = user.email;
          }
        }

        if (userEmail) {
          try {
            emailSent = await sendTripCancellationEmail(userEmail, userName || 'Traveler', plan);
          } catch (emailErr) {
            console.warn('⚠️  Failed to send cancellation email:', emailErr.message || emailErr);
          }
        }
      }

      // finally delete the plan
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM travel_plans WHERE id = ? AND user_id = ?', [id, req.session.userId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({ success: true, emailSent, refundScheduled });
    }

    const idx = mockPlans.findIndex(p => p.id === id && p.user_id === req.session.userId);
    if (idx !== -1) {
      const plan = mockPlans[idx];
      if (plan && plan.status === 'confirmed') {
        // mock refund scheduling
        refundScheduled = true;
        if (req.session?.userEmail) {
          try {
            emailSent = await sendTripCancellationEmail(req.session.userEmail, req.session.userName || 'Traveler', plan);
          } catch (e) {
            console.warn('⚠️  Failed to send cancellation email (mock):', e.message || e);
          }
        }
      }
      mockPlans.splice(idx, 1);
    }
    res.json({ success: true, emailSent, refundScheduled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

app.put('/api/plans/:id/book', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    let plan = null;
    if (db) {
      await new Promise((resolve, reject) => {
        db.run('UPDATE travel_plans SET status = ? WHERE id = ? AND user_id = ?', ['confirmed', id, req.session.userId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
      plan = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM travel_plans WHERE id = ? AND user_id = ?', [id, req.session.userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    } else {
      const idx = mockPlans.findIndex(p => p.id === id && p.user_id === req.session.userId);
      if (idx !== -1) {
        mockPlans[idx].status = 'confirmed';
        plan = mockPlans[idx];
      }
    }

    let emailSent = false;
    if (plan && emailTransporter && req.session?.userEmail) {
      try {
        emailSent = await sendTripConfirmationEmail(req.session.userEmail, req.session.userName, plan);
      } catch (emailErr) {
        console.warn('⚠️  Failed to send trip confirmation email:', emailErr.message || emailErr);
      }
    }

    return res.json({ success: true, emailSent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

// ─── Serve HTML pages ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'travel-planner', 'travel-planner', 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'travel-planner', 'travel-planner', 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'travel-planner', 'travel-planner', 'public', 'register.html')));
app.get('/planner', (req, res) => res.sendFile(path.join(__dirname, 'travel-planner', 'travel-planner', 'public', 'planner.html')));
app.get('/account', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'travel-planner', 'travel-planner', 'public', 'account.html')));

// Fallback for unmapped routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'travel-planner', 'travel-planner', 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`🌍 Travel Planner running at http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const fallbackPort = PORT + 1;
      console.error(`❌ Port ${PORT} is already in use. Trying port ${fallbackPort} instead...`);
      server.listen(fallbackPort, () => {
        console.log(`🌍 Travel Planner running at http://localhost:${fallbackPort}`);
      });
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
});