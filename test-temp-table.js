// Simple test script to verify temporary table creation and data insertion
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTempTable() {
  try {
    console.log('Testing temporary table creation and data insertion...');
    
    // Test data
    const testData = [
      { name: 'John', age: 30, city: 'New York' },
      { name: 'Jane', age: 25, city: 'Los Angeles' },
      { name: 'Bob', age: 35, city: 'Chicago' }
    ];
    
    const headers = ['name', 'age', 'city'];
    const tableName = 'temp_data_test_123_456_789';
    
    // Create table
    console.log('Creating table...');
    const { error: createError } = await supabase.rpc('create_temp_table', {
      table_name: tableName,
      column_definitions: '"name" TEXT, "age" TEXT, "city" TEXT'
    });
    
    if (createError) {
      console.error('Error creating table:', createError);
      return;
    }
    
    console.log('Table created successfully');
    
    // Insert data
    console.log('Inserting data...');
    const { error: insertError } = await supabase.rpc('insert_temp_data_json', {
      table_name: tableName,
      data_json: testData
    });
    
    if (insertError) {
      console.error('Error inserting data:', insertError);
      return;
    }
    
    console.log('Data inserted successfully');
    
    // Verify data
    console.log('Verifying data...');
    const { data: countData, error: countError } = await supabase.rpc('exec_sql_with_result', {
      query: `SELECT COUNT(*) as row_count FROM "${tableName}"`
    });
    
    if (countError) {
      console.error('Error counting rows:', countError);
      return;
    }
    
    console.log('Row count:', countData);
    
    // Select data
    const { data: selectData, error: selectError } = await supabase.rpc('exec_sql_with_result', {
      query: `SELECT * FROM "${tableName}" LIMIT 5`
    });
    
    if (selectError) {
      console.error('Error selecting data:', selectError);
      return;
    }
    
    console.log('Selected data:', selectData);
    
    // Clean up
    console.log('Cleaning up...');
    const { error: dropError } = await supabase.rpc('drop_temp_table', {
      table_name: tableName
    });
    
    if (dropError) {
      console.error('Error dropping table:', dropError);
      return;
    }
    
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testTempTable();
