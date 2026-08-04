require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'travel-planner-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── Database Pool ────────────────────────────────────────────────────────────
let db;
async function initDB() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'travel_planner',
      waitForConnections: true,
      connectionLimit: 10
    });
    const [rows] = await db.query('SELECT 1');
    console.log('✅ MySQL connected successfully');
    return true;
  } catch (err) {
    console.warn('⚠️  MySQL not available — running with in-memory mock data');
    console.warn('   Configure .env with your DB credentials and restart.');
    db = null;
    return false;
  }
}

const smtpHost = process.env.SMTP_HOST?.trim();
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS?.trim();
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const emailTransporter = (smtpHost && smtpUser && smtpPass)
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    })
  : null;

const FX_RATES = {
  USD: { rate: 1,    symbol: '$'  },
  EUR: { rate: 0.92, symbol: '€'  },
  GBP: { rate: 0.79, symbol: '£'  },
  INR: { rate: 83.12,symbol: '₹'  },
  JPY: { rate: 149.5,symbol: '¥'  },
  AUD: { rate: 1.53, symbol: 'A$' },
  CAD: { rate: 1.36, symbol: 'C$' },
  SGD: { rate: 1.34, symbol: 'S$' },
  AED: { rate: 3.67, symbol: 'د.إ' },
  THB: { rate: 35.2, symbol: '฿'  }
};

function formatBudget(plan) {
  const currency = (plan.currency || 'USD').toString().trim().toUpperCase();
  const amountUSD = Number(plan.total_budget_usd) || 0;
  const fx = FX_RATES[currency] || FX_RATES.USD;
  const converted = Math.round(amountUSD * fx.rate);
  return `${fx.symbol}${converted.toLocaleString()} ${currency}`;
}

async function sendVerificationEmail(toEmail, name, token) {
  if (!emailTransporter) {
    console.warn('⚠️  Email not sent: SMTP is not configured.');
    return;
  }

  const subject = process.env.EMAIL_SUBJECT || 'Verify your Wanderlust account';
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/verify?token=${token}`;
  const text = `Hi ${name},\n\nWelcome to Wanderlust! Please verify your email address by clicking the link below:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nHappy travels,\nThe Wanderlust Team`;
  const html = `
    <p>Hi ${name},</p>
    <p>Welcome to <strong>Wanderlust</strong>! Please verify your email address by clicking the button below:</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email Address</a>
    </p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p><a href="${verificationUrl}">${verificationUrl}</a></p>
    <p>This link will expire in 24 hours.</p>
    <p>Happy travels,<br>The Wanderlust Team</p>
  `;

  await emailTransporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html
  });
}

async function sendWelcomeEmail(toEmail, name) {
  if (!emailTransporter) {
    console.warn('⚠️  Email not sent: SMTP is not configured.');
    return;
  }

  const subject = 'Welcome to Wanderlust!';
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  const text = `Hi ${name},\n\nYour account has been successfully verified! You can now log in and start planning your trips.\n\nHappy travels,\nThe Wanderlust Team`;
  const html = `
    <p>Hi ${name},</p>
    <p>Your account has been successfully verified! You can now sign in and start planning your next adventure.</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${process.env.BASE_URL || 'http://localhost:3000'}/login" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Sign In to Wanderlust</a>
    </p>
    <p>Happy travels,<br>The Wanderlust Team</p>
  `;

  await emailTransporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html
  });
}

async function sendBookingConfirmationEmail(toEmail, name, plan) {
  if (!emailTransporter) {
    console.warn('⚠️  Email not sent: SMTP is not configured.');
    return;
  }

  const budget = formatBudget(plan);
  const subject = process.env.TRIP_CONFIRMATION_SUBJECT || 'Your Wanderlust trip is confirmed!';
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  
  const text = `Hi ${name},\n\nYour booking to ${plan.destination_name} has been confirmed!\n\nTrip Summary:\n- Departure: ${plan.departure_city}\n- Dates: ${plan.travel_date} to ${plan.return_date}\n- Travelers: ${plan.travelers}\n- Budget: ${budget}\n- Accommodation: ${plan.accommodation_type} (${plan.accommodation_stars} stars)\n- Flight: ${plan.flight_class}\n\nHappy travels,\nThe Wanderlust Team`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2a7a3b; border-bottom: 2px solid #2a7a3b; padding-bottom: 10px;">🎉 Booking Confirmed!</h2>
      <p>Hi ${name},</p>
      <p>Your trip to <strong>${plan.destination_name}</strong> has been successfully booked and confirmed. Here is your trip summary:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Destination</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.destination_name}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Departure City</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.departure_city}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Travel Dates</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.travel_date} to ${plan.return_date}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Travelers</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.travelers}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Total Budget</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${budget}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Accommodation</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.accommodation_type} (${plan.accommodation_stars}★)</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Flight Class</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.flight_class}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Car Rental</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.car_rental ? `Yes (${plan.car_type})` : 'No'}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Dining Preference</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.food_preference}</td>
        </tr>
      </table>
      
      ${plan.notes ? `<p><strong>Special Notes:</strong> ${plan.notes}</p>` : ''}
      
      <p style="margin-top: 30px;">Thank you for planning with <strong>Wanderlust</strong>!</p>
      <p>Happy travels,<br>The Wanderlust Team</p>
    </div>
  `;

  await emailTransporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html
  });
}

async function sendPlanSummaryEmail(toEmail, name, plan) {
  if (!emailTransporter) {
    console.warn('⚠️  Email not sent: SMTP is not configured.');
    return;
  }

  const budget = formatBudget(plan);
  const subject = process.env.PLAN_SUMMARY_SUBJECT || 'Your new Wanderlust trip plan summary';
  const from = process.env.EMAIL_FROM || 'Wanderlust <no-reply@wanderlust.app>';
  const text = `Hi ${name},\n\nYour new trip plan has been saved successfully! Here is your summary:\n- Destination: ${plan.destination_name}\n- Departure city: ${plan.departure_city}\n- Dates: ${plan.travel_date} to ${plan.return_date}\n- Travelers: ${plan.travelers}\n- Budget: ${budget}\n- Accommodation: ${plan.accommodation_type} (${plan.accommodation_stars} stars)\n- Flight class: ${plan.flight_class}\n- Food preference: ${plan.food_preference}\n\nThank you for planning with Wanderlust!\nThe Wanderlust Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2a7a3b; border-bottom: 2px solid #2a7a3b; padding-bottom: 10px;">📝 Trip Plan Saved</h2>
      <p>Hi ${name},</p>
      <p>Your new trip plan has been saved successfully. Here is your budget-friendly summary:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Destination</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.destination_name}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Departure City</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.departure_city}</td></tr>
        <tr style="background-color: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Dates</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.travel_date} to ${plan.return_date}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Travelers</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.travelers}</td></tr>
        <tr style="background-color: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Budget</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${budget}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Accommodation</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.accommodation_type} (${plan.accommodation_stars}★)</td></tr>
        <tr style="background-color: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Flight Class</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.flight_class}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Car Rental</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.car_rental ? `Yes (${plan.car_type})` : 'No'}</td></tr>
        <tr style="background-color: #f8fafc;"><td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Dining Preference</td><td style="padding: 10px; border: 1px solid #e2e8f0;">${plan.food_preference}</td></tr>
      </table>
      ${plan.notes ? `<p><strong>Special Notes:</strong> ${plan.notes}</p>` : ''}
      <p style="margin-top: 30px;">Thank you for planning with <strong>Wanderlust</strong>!</p>
      <p>Happy travels,<br>The Wanderlust Team</p>
    </div>
  `;
  await emailTransporter.sendMail({ from, to: toEmail, subject, text, html });
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

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const shouldAutoVerify = !emailTransporter;
  const verificationToken = shouldAutoVerify ? null : require('crypto').randomBytes(32).toString('hex');

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    if (db) {
      const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length) return res.status(409).json({ error: 'Email already registered' });
      const [result] = await db.query(
        'INSERT INTO users (name, email, password, verified, verification_token) VALUES (?, ?, ?, ?, ?)',
        [name, email, hashedPassword, shouldAutoVerify ? 1 : 0, verificationToken]
      );

      if (emailTransporter && !shouldAutoVerify) {
        try {
          await sendVerificationEmail(email, name, verificationToken);
        } catch (emailErr) {
          console.warn('⚠️  Failed to send verification email:', emailErr.message || emailErr);
          await db.query('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?', [result.insertId]);
        }
      }

      if (shouldAutoVerify) {
        req.session.userId = result.insertId;
        req.session.userName = name;
      }
    } else {
      if (mockUsers.find(u => u.email === email))
        return res.status(409).json({ error: 'Email already registered' });
      const id = mockUsers.length + 1;
      mockUsers.push({ id, name, email, password: hashedPassword, verified: shouldAutoVerify, verification_token: verificationToken });

      if (emailTransporter && !shouldAutoVerify) {
        try {
          await sendVerificationEmail(email, name, verificationToken);
        } catch (emailErr) {
          console.warn('⚠️  Failed to send verification email:', emailErr.message || emailErr);
          const user = mockUsers.find(u => u.id === id);
          if (user) {
            user.verified = true;
            user.verification_token = null;
          }
        }
      }

      if (shouldAutoVerify) {
        req.session.userId = id;
        req.session.userName = name;
      }
    }

    const successMessage = shouldAutoVerify
      ? 'Account created and verified! You are now signed in.'
      : 'Account created! Please check your email to verify your account.';

    res.json({ success: true, message: successMessage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    let user;
    if (db) {
      const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      user = rows[0];
    } else {
      user = mockUsers.find(u => u.email === email);
    }
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Check if account is verified
    if (!user.verified) {
      return res.status(403).json({ error: 'Please verify your email address before signing in. Check your email for the verification link.' });
    }

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    res.json({ success: true, user: { name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ authenticated: true, name: req.session.userName, id: req.session.userId, email: req.session.userEmail });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('<h1>Invalid verification link</h1><p>The verification token is missing.</p>');
  }

  try {
    let user;
    if (db) {
      const [rows] = await db.query('SELECT * FROM users WHERE verification_token = ? AND verified = 0', [token]);
      user = rows[0];
      if (user) {
        await db.query('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?', [user.id]);
      }
    } else {
      user = mockUsers.find(u => u.verification_token === token && !u.verified);
      if (user) {
        user.verified = true;
        user.verification_token = null;
      }
    }

    if (!user) {
      return res.status(400).send('<h1>Invalid or expired verification link</h1><p>This verification link is invalid or has already been used.</p>');
    }

    if (emailTransporter) {
      try {
        await sendWelcomeEmail(user.email, user.name);
      } catch (emailErr) {
        console.warn('⚠️  Failed to send welcome email:', emailErr.message || emailErr);
      }
    }

    res.send(`
      <h1>Email verified successfully!</h1>
      <p>Welcome to Wanderlust, ${user.name}! Your account has been verified.</p>
      <p><a href="/login">Click here to sign in</a></p>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('<h1>Verification failed</h1><p>Please try again later.</p>');
  }
});

// ─── Destinations Routes ──────────────────────────────────────────────────────
app.get('/api/destinations', async (req, res) => {
  try {
    if (db) {
      const [rows] = await db.query('SELECT * FROM destinations ORDER BY rating DESC');
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
      const [rows] = await db.query('SELECT * FROM destinations WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      return res.json(rows[0]);
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
      const [rows] = await db.query(
        'SELECT tp.*, d.name as dest_name, d.image_url FROM travel_plans tp LEFT JOIN destinations d ON tp.destination_id = d.id WHERE tp.user_id = ? ORDER BY tp.created_at DESC',
        [req.session.userId]
      );
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
    if (db) {
      const [result] = await db.query(
        `INSERT INTO travel_plans (user_id, destination_id, destination_name, departure_city, travel_date, return_date, travelers, accommodation_type, accommodation_stars, flight_class, car_rental, car_type, food_preference, payment_method, total_budget_usd, currency, notes, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [plan.user_id, plan.destination_id||null, plan.destination_name, plan.departure_city, plan.travel_date, plan.return_date, plan.travelers||1, plan.accommodation_type||'hotel', plan.accommodation_stars||3, plan.flight_class||'economy', plan.car_rental||false, plan.car_type||null, plan.food_preference||'mixed', plan.payment_method||'credit_card', plan.total_budget_usd||null, plan.currency||'USD', plan.notes||null, 'draft']
      );
      plan.id = result.insertId;
      if (emailTransporter) {
        const [users] = await db.query('SELECT name, email FROM users WHERE id = ?', [req.session.userId]);
        if (users[0]) {
          await sendPlanSummaryEmail(users[0].email, users[0].name, plan).catch(err => console.warn('⚠️  Plan summary email failed:', err.message || err));
        }
      }
      return res.json({ success: true, id: result.insertId });
    }
    const id = mockPlans.length + 1;
    const savedPlan = { id, ...plan, status: 'draft', created_at: new Date() };
    mockPlans.push(savedPlan);
    if (emailTransporter) {
      const user = mockUsers.find(u => u.id === req.session.userId);
      if (user) {
        await sendPlanSummaryEmail(user.email, user.name, savedPlan).catch(err => console.warn('⚠️  Plan summary email failed:', err.message || err));
      }
    }
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save plan' });
  }
});

app.delete('/api/plans/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (db) {
      await db.query('DELETE FROM travel_plans WHERE id = ? AND user_id = ?', [id, req.session.userId]);
      return res.json({ success: true });
    }
    const idx = mockPlans.findIndex(p => p.id === id && p.user_id === req.session.userId);
    if (idx !== -1) mockPlans.splice(idx, 1);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

app.put('/api/plans/:id/book', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    let plan;
    let userEmail;
    let userName;

    if (db) {
      await db.query('UPDATE travel_plans SET status = ? WHERE id = ? AND user_id = ?', ['confirmed', id, req.session.userId]);
      
      const [plans] = await db.query('SELECT * FROM travel_plans WHERE id = ? AND user_id = ?', [id, req.session.userId]);
      plan = plans[0];
      if (plan && plan.currency) plan.currency = plan.currency.toString().trim().toUpperCase();
      
      const [users] = await db.query('SELECT name, email FROM users WHERE id = ?', [req.session.userId]);
      if (users[0]) {
        userEmail = users[0].email;
        userName = users[0].name;
      }
    } else {
      const idx = mockPlans.findIndex(p => p.id === id && p.user_id === req.session.userId);
      if (idx !== -1) {
        mockPlans[idx].status = 'confirmed';
        plan = mockPlans[idx];
      }
      const user = mockUsers.find(u => u.id === req.session.userId);
      if (user) {
        userEmail = user.email;
        userName = user.name;
      }
    }

    if (plan && userEmail) {
      if (emailTransporter) {
        try {
          await sendBookingConfirmationEmail(userEmail, userName, plan);
        } catch (emailErr) {
          console.warn('⚠️  Failed to send booking confirmation email:', emailErr.message || emailErr);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

// ─── Serve HTML pages ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/planner', (req, res) => res.sendFile(path.join(__dirname, 'public', 'planner.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));

// ─── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🌍 Travel Planner running at http://localhost:${PORT}`);
  });
});
