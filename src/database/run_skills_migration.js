// Run the skills column migration
import { supabase } from '../supabaseClient.js';

const runSkillsMigration = async () => {
  try {
    console.log('🔄 Starting skills column migration...');
    
    // Read the SQL migration file
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationSQL = fs.readFileSync(path.join(__dirname, 'add_skills_column.sql'), 'utf8');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
    
    console.log('✅ Skills column migration completed successfully!');
    console.log('📊 Migration result:', data);
    
  } catch (error) {
    console.error('❌ Error running skills migration:', error);
    
    // If the RPC function doesn't exist, provide manual instructions
    if (error.message?.includes('function exec_sql') || error.message?.includes('does not exist')) {
      console.log('\n📋 Manual Migration Instructions:');
      console.log('1. Open your Supabase SQL Editor');
      console.log('2. Copy and paste the contents of add_skills_column.sql');
      console.log('3. Execute the SQL script');
      console.log('\n📄 SQL to execute:');
      console.log(`
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS skills TEXT;

COMMENT ON COLUMN users.skills IS 'Comma-separated list of barber skills/specializations';

UPDATE users 
SET skills = 'Haircut, Beard Trim, Styling'
WHERE role = 'barber' 
AND skills IS NULL;
      `);
    }
  }
};

// Run the migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSkillsMigration();
}

export default runSkillsMigration;
