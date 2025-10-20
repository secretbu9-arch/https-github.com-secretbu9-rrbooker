// Debug component to test day-off functionality
import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import BarberAvailabilityService from '../../services/BarberAvailabilityService';

const DayOffTester = ({ user }) => {
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const testDayOffSystem = async () => {
    setLoading(true);
    setTestResults([]);
    
    const results = [];
    
    try {
      // Test 1: Check if table exists
      results.push('🔍 Test 1: Checking if barber_day_offs table exists...');
      
      const { data: tableCheck, error: tableError } = await supabase
        .from('barber_day_offs')
        .select('count')
        .limit(1);
      
      if (tableError) {
        results.push(`❌ Table doesn't exist or RLS issue: ${tableError.message}`);
        results.push('💡 Solution: Run the database migration script');
      } else {
        results.push('✅ Table exists and is accessible');
      }

      // Test 2: Check current user's day-offs
      results.push('\n🔍 Test 2: Checking current user\'s day-offs...');
      
      const { data: userDayOffs, error: dayOffError } = await supabase
        .from('barber_day_offs')
        .select('*')
        .eq('barber_id', user.id);
      
      if (dayOffError) {
        results.push(`❌ Error fetching day-offs: ${dayOffError.message}`);
      } else {
        results.push(`✅ Found ${userDayOffs?.length || 0} day-offs for current user`);
        if (userDayOffs && userDayOffs.length > 0) {
          userDayOffs.forEach(dayOff => {
            results.push(`   - ${dayOff.type}: ${dayOff.start_date} to ${dayOff.end_date} (${dayOff.is_active ? 'active' : 'inactive'})`);
          });
        }
      }

      // Test 3: Test availability check
      results.push('\n🔍 Test 3: Testing availability check...');
      
      const today = new Date().toISOString().split('T')[0];
      const availability = await BarberAvailabilityService.checkBarberAvailability(user.id, today);
      
      results.push(`📊 Availability result for today (${today}):`);
      results.push(`   - isAvailable: ${availability.isAvailable}`);
      results.push(`   - reason: ${availability.reason}`);
      results.push(`   - type: ${availability.type}`);
      
      if (availability.isAvailable) {
        results.push('✅ Barber appears available for today');
      } else {
        results.push(`❌ Barber unavailable: ${availability.reason}`);
      }

      // Test 3.5: Test availability for the day-off date
      if (userDayOffs && userDayOffs.length > 0) {
        const dayOffDate = userDayOffs[0].start_date;
        results.push(`\n🔍 Test 3.5: Testing availability for day-off date (${dayOffDate})...`);
        
        const availabilityForDayOff = await BarberAvailabilityService.checkBarberAvailability(user.id, dayOffDate);
        
        results.push(`📊 Availability result for day-off date (${dayOffDate}):`);
        results.push(`   - isAvailable: ${availabilityForDayOff.isAvailable}`);
        results.push(`   - reason: ${availabilityForDayOff.reason}`);
        results.push(`   - type: ${availabilityForDayOff.type}`);
        
        if (!availabilityForDayOff.isAvailable && availabilityForDayOff.type === 'day_off') {
          results.push('✅ Day-off blocking works correctly for the scheduled date!');
        } else {
          results.push('❌ Day-off blocking not working for the scheduled date');
        }
      }

      // Test 4: Create a test day-off
      results.push('\n🔍 Test 4: Creating test day-off...');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const testDayOff = await BarberAvailabilityService.setBarberUnavailable(
        user.id,
        tomorrowStr,
        tomorrowStr,
        'day_off',
        'Test day-off for debugging'
      );
      
      if (testDayOff.success) {
        results.push('✅ Test day-off created successfully');
        results.push(`   - ID: ${testDayOff.data.id}`);
        results.push(`   - Date: ${testDayOff.data.start_date}`);
      } else {
        results.push(`❌ Failed to create test day-off: ${testDayOff.error}`);
      }

      // Test 5: Test availability with day-off
      results.push('\n🔍 Test 5: Testing availability with day-off...');
      
      const availabilityWithDayOff = await BarberAvailabilityService.checkBarberAvailability(user.id, tomorrowStr);
      
      results.push(`📊 Availability with day-off for ${tomorrowStr}:`);
      results.push(`   - isAvailable: ${availabilityWithDayOff.isAvailable}`);
      results.push(`   - reason: ${availabilityWithDayOff.reason}`);
      results.push(`   - type: ${availabilityWithDayOff.type}`);
      
      if (!availabilityWithDayOff.isAvailable && availabilityWithDayOff.type === 'day_off') {
        results.push('✅ Day-off blocking works correctly!');
      } else {
        results.push('❌ Day-off blocking not working - barber still appears available');
        results.push(`   - Expected: isAvailable=false, type='day_off'`);
        results.push(`   - Actual: isAvailable=${availabilityWithDayOff.isAvailable}, type='${availabilityWithDayOff.type}'`);
      }

      // Clean up test day-off
      results.push('\n🧹 Cleaning up test day-off...');
      
      const { error: deleteError } = await supabase
        .from('barber_day_offs')
        .delete()
        .eq('barber_id', user.id)
        .eq('start_date', tomorrowStr)
        .eq('reason', 'Test day-off for debugging');
      
      if (deleteError) {
        results.push(`⚠️ Could not clean up test day-off: ${deleteError.message}`);
      } else {
        results.push('✅ Test day-off cleaned up');
      }

    } catch (error) {
      results.push(`❌ Test failed with error: ${error.message}`);
    }
    
    setTestResults(results);
    setLoading(false);
  };

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h4>Day-Off System Tester</h4>
              <p className="mb-0">Debug tool to test barber day-off functionality</p>
            </div>
            <div className="card-body">
              <button 
                className="btn btn-primary"
                onClick={testDayOffSystem}
                disabled={loading}
              >
                {loading ? 'Testing...' : 'Run Day-Off Tests'}
              </button>
              
              {testResults.length > 0 && (
                <div className="mt-4">
                  <h5>Test Results:</h5>
                  <pre className="bg-light p-3 rounded" style={{ whiteSpace: 'pre-wrap' }}>
                    {testResults.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayOffTester;
