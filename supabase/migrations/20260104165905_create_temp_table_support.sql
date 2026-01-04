-- Create function to execute SQL queries safely
-- This function allows us to execute dynamic SQL from our application
CREATE OR REPLACE FUNCTION public.exec_sql(query TEXT)
RETURNS TABLE(result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    result_json JSONB;
BEGIN
    -- Execute the query and return results as JSONB
    FOR rec IN EXECUTE query LOOP
        result_json := to_jsonb(rec);
        RETURN NEXT;
    END LOOP;
    
    -- If no results, return empty array
    IF NOT FOUND THEN
        result_json := '[]'::jsonb;
        RETURN NEXT;
    END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO authenticated;

-- Create a more robust version that handles different query types
CREATE OR REPLACE FUNCTION public.exec_sql_with_result(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result_json JSONB;
    rec RECORD;
    results JSONB[] := '{}';
BEGIN
    -- Execute the query and collect results
    FOR rec IN EXECUTE query LOOP
        results := array_append(results, to_jsonb(rec));
    END LOOP;
    
    -- Return results as JSONB array
    result_json := to_jsonb(results);
    RETURN result_json;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.exec_sql_with_result(TEXT) TO authenticated;

-- Create function to safely create tables with dynamic column names
CREATE OR REPLACE FUNCTION public.create_temp_table(
    table_name TEXT,
    column_definitions TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    full_query TEXT;
BEGIN
    -- Build the CREATE TABLE query
    full_query := format('CREATE TABLE IF NOT EXISTS %I (id SERIAL PRIMARY KEY, %s)', 
                        table_name, 
                        column_definitions);
    
    -- Execute the query
    EXECUTE full_query;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return false
        RAISE WARNING 'Failed to create table %: %', table_name, SQLERRM;
        RETURN FALSE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_temp_table(TEXT, TEXT) TO authenticated;

-- Create function to safely drop tables
CREATE OR REPLACE FUNCTION public.drop_temp_table(table_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only allow dropping tables that match our temp table pattern
    IF table_name ~ '^temp_data_[a-f0-9_]+_[a-f0-9_]+_[0-9]+$' THEN
        EXECUTE format('DROP TABLE IF EXISTS %I', table_name);
        RETURN TRUE;
    ELSE
        RAISE WARNING 'Table name % does not match temp table pattern', table_name;
        RETURN FALSE;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to drop table %: %', table_name, SQLERRM;
        RETURN FALSE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.drop_temp_table(TEXT) TO authenticated;

-- Create function to insert data into temp tables
CREATE OR REPLACE FUNCTION public.insert_temp_data(
    table_name TEXT,
    column_names TEXT[],
    data_values TEXT[][]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    insert_query TEXT;
    column_list TEXT;
    value_placeholders TEXT;
    i INTEGER;
    row_count INTEGER := 0;
BEGIN
    -- Validate table name pattern
    IF table_name !~ '^temp_data_[a-f0-9_]+_[a-f0-9_]+_[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid table name pattern: %', table_name;
    END IF;
    
    -- Build column list
    column_list := array_to_string(column_names, ', ');
    
    -- Build value placeholders
    value_placeholders := '(' || array_to_string(
        array_fill('$' || generate_series(1, array_length(column_names, 1))::TEXT, 
                  '[1:' || array_length(column_names, 1) || ']'), 
        ', '
    ) || ')';
    
    -- Build INSERT query
    insert_query := format('INSERT INTO %I (%s) VALUES %s', 
                          table_name, 
                          column_list, 
                          value_placeholders);
    
    -- Insert data row by row
    FOR i IN 1..array_length(data_values, 1) LOOP
        EXECUTE insert_query USING data_values[i];
        row_count := row_count + 1;
    END LOOP;
    
    RETURN row_count;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to insert data into table %: %', table_name, SQLERRM;
        RETURN 0;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_temp_data(TEXT, TEXT[], TEXT[][]) TO authenticated;

-- Create a simpler version that works with JSONB data
CREATE OR REPLACE FUNCTION public.insert_temp_data_json(
    table_name TEXT,
    data_json JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec JSONB;
    insert_query TEXT;
    column_names TEXT[];
    column_values TEXT[];
    row_count INTEGER := 0;
    col_name TEXT;
    col_value TEXT;
BEGIN
    -- Validate table name pattern
    IF table_name !~ '^temp_data_[a-f0-9_]+_[a-f0-9_]+_[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid table name pattern: %', table_name;
    END IF;
    
    -- Process each row in the JSONB array
    FOR rec IN SELECT * FROM jsonb_array_elements(data_json) LOOP
        -- Extract column names and values
        column_names := ARRAY[]::TEXT[];
        column_values := ARRAY[]::TEXT[];
        
        FOR col_name IN SELECT jsonb_object_keys(rec) LOOP
            column_names := array_append(column_names, col_name);
            col_value := rec->>col_name;
            IF col_value IS NULL THEN
                column_values := array_append(column_values, 'NULL');
            ELSE
                column_values := array_append(column_values, quote_literal(col_value));
            END IF;
        END LOOP;
        
        -- Build and execute INSERT query
        insert_query := format('INSERT INTO %I (%s) VALUES (%s)', 
                              table_name, 
                              array_to_string(column_names, ', '),
                              array_to_string(column_values, ', '));
        
        EXECUTE insert_query;
        row_count := row_count + 1;
    END LOOP;
    
    RETURN row_count;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to insert JSON data into table %: %', table_name, SQLERRM;
        RETURN 0;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_temp_data_json(TEXT, JSONB) TO authenticated;
