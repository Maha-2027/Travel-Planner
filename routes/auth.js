const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = ({ getDb, mockUsers, getEmailTransporter, sendWelcomeEmail }) => {
  const router = express.Router();

  async function findUserByEmail(email) {
    const db = getDb();
    if (db) {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
    return mockUsers.find(u => u.email === email);
  }

  async function createUser(req, name, email, hashedPassword) {
    const db = getDb();
    if (db) {
      return new Promise((resolve, reject) => {
        db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
          [name, email, hashedPassword], function(err) {
            if (err) reject(err);
            else resolve({ insertId: this.lastID });
          });
      });
    }

    const id = mockUsers.length + 1;
    mockUsers.push({ id, name, email, password: hashedPassword });
    return { insertId: id };
  }

  async function setSession(req, user) {
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
  }

  router.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'All fields are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    try {
      const existing = await findUserByEmail(email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const hashedPassword = await bcrypt.hash(password, 12);
      const result = await createUser(req, name, email, hashedPassword);
      await setSession(req, { id: result.insertId, name, email });

      let emailSent = false;
      if (getEmailTransporter()) {
        try {
          emailSent = await sendWelcomeEmail(email, name);
        } catch (emailErr) {
          console.warn('⚠️  Failed to send welcome email:', emailErr.message || emailErr);
        }
      }

      res.json({ success: true, user: { name, email }, emailSent });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  router.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    try {
      const user = await findUserByEmail(email);
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      await setSession(req, user);
      res.json({ success: true, user: { name: user.name, email: user.email } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  router.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  router.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.userId) {
      return res.json({ authenticated: true, name: req.session.userName, id: req.session.userId, email: req.session.userEmail });
    }
    res.json({ authenticated: false });
  });

  return router;
};
