const sqlite3 = require('sqlite3'); 
const db = new sqlite3.Database('c:/Users/MAHALAKSHMI/Downloads/files/travel-planner/travel-planner/db/travel_planner.db'); 
db.run("ALTER TABLE travel_plans ADD COLUMN status TEXT DEFAULT 'draft'", (err) => { 
  if(err) console.error(err); else console.log('Column added successfully'); 
});
