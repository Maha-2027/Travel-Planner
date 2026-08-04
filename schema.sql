-- Travel Planner Database Schema
-- Run: mysql -u root -p < db/schema.sql

CREATE DATABASE IF NOT EXISTS travel_planner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE travel_planner;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS destinations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  short_desc TEXT,
  long_desc TEXT,
  image_url VARCHAR(500),
  avg_cost_usd DECIMAL(10,2),
  best_season VARCHAR(100),
  category VARCHAR(50),
  rating DECIMAL(3,2) DEFAULT 4.5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS travel_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  destination_id INT,
  destination_name VARCHAR(100),
  departure_city VARCHAR(100),
  travel_date DATE,
  return_date DATE,
  travelers INT DEFAULT 1,
  accommodation_type ENUM('hotel','hostel','resort','airbnb','villa') DEFAULT 'hotel',
  accommodation_stars INT DEFAULT 3,
  flight_class ENUM('economy','business','first') DEFAULT 'economy',
  car_rental BOOLEAN DEFAULT FALSE,
  car_type VARCHAR(50),
  food_preference ENUM('budget','mid-range','fine-dining','mixed') DEFAULT 'mixed',
  payment_method ENUM('credit_card','debit_card','paypal','bank_transfer','upi') DEFAULT 'credit_card',
  total_budget_usd DECIMAL(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  notes TEXT,
  status ENUM('draft','confirmed','completed','cancelled') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE SET NULL
);

-- Seed destinations
INSERT INTO destinations (name, country, short_desc, long_desc, image_url, avg_cost_usd, best_season, category, rating) VALUES
('Paris', 'France', 'City of light, love & haute cuisine', 'Paris enchants with its iconic Eiffel Tower, world-class museums, and vibrant café culture. Wander through Montmartre, explore the Louvre, and savour croissants along the Seine.', 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800', 2200.00, 'Apr–Jun, Sep–Oct', 'city', 4.8),
('Tokyo', 'Japan', 'Where tradition meets neon-lit future', 'Tokyo is a sensory overload in the best way — ancient shrines beside towering skyscrapers, world-renowned ramen, and cherry blossoms in spring. An unmissable metropolis.', 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800', 2500.00, 'Mar–May, Sep–Nov', 'city', 4.9),
('Bali', 'Indonesia', 'Island of gods, temples & surf', 'Bali blends lush rice terraces, Hindu temple ceremonies, volcanic mountains, and world-class surf breaks into one unforgettable island paradise. Spiritual and stunning.', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800', 1200.00, 'Apr–Oct', 'beach', 4.7),
('New York', 'USA', 'The city that never sleeps', 'From Central Park to Times Square, the High Line to world-class galleries, New York City pulses with relentless energy. Every neighborhood a different world.', 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800', 3000.00, 'Apr–Jun, Sep–Nov', 'city', 4.7),
('Cape Town', 'South Africa', 'Where mountains meet the ocean', 'Cape Town stuns with Table Mountain, the Cape Winelands, penguins at Boulders Beach, and a vibrant food scene. One of the world\'s most dramatically beautiful cities.', 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800', 1500.00, 'Nov–Mar', 'nature', 4.8),
('Santorini', 'Greece', 'Whitewashed cliffs & volcanic sunsets', 'Santorini\'s iconic blue-domed churches, dramatic caldera views, and blazing sunsets over Oia make it one of Europe\'s most photogenic and romantic escapes.', 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800', 2800.00, 'May–Oct', 'beach', 4.9),
('Machu Picchu', 'Peru', 'Lost city of the Inca empire', 'Perched high in the Andes, Machu Picchu is one of the world\'s great archaeological wonders. The misty mountain citadel, llamas included, is worth every step of the hike.', 'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800', 1800.00, 'May–Sep', 'adventure', 4.9),
('Maldives', 'Maldives', 'Overwater bungalows & crystal lagoons', 'The Maldives defines luxury tropical escape — turquoise lagoons, vibrant coral reefs, and the world\'s most stunning overwater villas set across 1,200 islands.', 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800', 4500.00, 'Nov–Apr', 'beach', 4.9),
('Safari Kenya', 'Kenya', 'The great migration & big five', 'The Masai Mara hosts the greatest wildlife spectacle on Earth — the Great Migration of millions of wildebeest. Add lions, elephants, and starlit bush camps.', 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?w=800', 3500.00, 'Jul–Oct', 'adventure', 4.8),
('Amsterdam', 'Netherlands', 'Canals, cycling & golden age art', 'Amsterdam charms with its ring of historic canals, world-class museums including the Rijksmuseum and Van Gogh Museum, and a wonderfully laid-back cycling culture.', 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800', 1900.00, 'Apr–Aug', 'city', 4.6);
