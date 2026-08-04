# 🌍 Wanderlust — Premium Travel Planner

A full-stack travel planning web application with a premium green glassmorphism aesthetic.

## Stack
- **Frontend**: Plain HTML, Vanilla JS, Vanilla CSS (no frameworks)
- **Backend**: Node.js + Express
- **Database**: MySQL (with automatic in-memory mock fallback)
- **Fonts**: Cormorant Garamond + DM Sans (Google Fonts)

## Project Structure
```
travel-planner/
├── db/
│   └── schema.sql          # MySQL schema + seed data
├── public/
│   ├── css/
│   │   └── style.css       # Full responsive stylesheet
│   ├── js/
│   │   └── app.js          # All frontend logic
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   ├── register.html       # Registration page
│   └── planner.html        # Multi-step trip planner
├── .env.example            # Environment variable template
├── package.json
└── server.js               # Express backend + API routes
```

## Setup

### 1. Install dependencies
```bash
cd travel-planner
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 3. Set up MySQL (optional)
```bash
mysql -u root -p < db/schema.sql
```
> **Note:** If MySQL is unavailable, the app runs automatically with in-memory mock data. All features work — data just won't persist between server restarts.

### 4. Run the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

Open http://localhost:3000

## Features

### Landing Page (`/`)
- Animated hero with floating destination cards
- Filterable destinations grid (All / Cities / Beaches / Adventure / Nature)
- Features section
- Responsive navigation with hamburger menu

### Authentication (`/login`, `/register`)
- Glassmorphism card design
- bcrypt password hashing
- Session-based authentication
- **Email verification** — users must verify email before login
- Client-side validation + server error display

### Trip Planner (`/planner`)
- **4-step form**: Destination → Dates → Preferences → Review
- Accommodation type + star rating
- Flight class selector (Economy / Business / First)
- Food preference selector
- Car rental toggle + type
- **Live budget estimator** — updates as you change options
- **10-currency switcher** (USD, EUR, GBP, INR, JPY, AUD, CAD, SGD, AED, THB)
- Trip summary before saving
- Saves to MySQL or mock storage

### Chatbot
- Slide-out panel accessible from every page
- Typing indicator animation
- Quick reply buttons
- Smart keyword-matching responses for 15+ topics
- Topics: destinations, budgets, visas, seasons, flights, hotels, etc.

## API Routes
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Sign in |
| POST | /api/auth/logout | Sign out |
| GET | /api/auth/me | Check auth status |
| GET | /api/auth/verify | Verify email address |
| GET | /api/destinations | List all destinations |
| GET | /api/destinations/:id | Single destination |
| GET | /api/plans | User's saved plans (auth required) |
| POST | /api/plans | Save a plan (auth required) |
| DELETE | /api/plans/:id | Delete a plan (auth required) |

## Currency Rates (hardcoded, USD base)
USD, EUR (0.92), GBP (0.79), INR (83.12), JPY (149.50), AUD (1.53), CAD (1.36), SGD (1.34), AED (3.67), THB (35.20)

## Responsive Breakpoints
- Mobile: < 480px
- Tablet: 480px – 768px  
- Desktop: > 768px

## To hook up a real AI chatbot later
In `public/js/app.js`, find the `getBotResponse()` function and replace it with an API call to OpenAI / Anthropic / Gemini.
