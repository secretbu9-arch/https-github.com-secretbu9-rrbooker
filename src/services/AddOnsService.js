import { supabase } from '../supabaseClient';

class AddOnsService {
  constructor() {
    this.addOnsCache = null;
    this.lastFetch = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Fetch add-ons from database with caching
   * @returns {Promise<Array>} Array of add-ons
   */
  async getAddOns() {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.addOnsCache && this.lastFetch && (now - this.lastFetch) < this.cacheTimeout) {
      console.log('📦 Returning cached add-ons data');
      return this.addOnsCache;
    }

    try {
      console.log('🔄 Fetching fresh add-ons data from database');
      const { data, error } = await supabase
        .from('add_ons')
        .select('id, name, description, price, duration, category, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('❌ Error fetching add-ons:', error);
        throw error;
      }

      // Update cache
      this.addOnsCache = data || [];
      this.lastFetch = now;
      
      console.log(`✅ Fetched ${this.addOnsCache.length} add-ons from database`);
      return this.addOnsCache;
    } catch (error) {
      console.error('❌ Failed to fetch add-ons:', error);
      
      // Return cached data if available, even if expired
      if (this.addOnsCache) {
        console.log('⚠️ Using expired cached add-ons data');
        return this.addOnsCache;
      }
      
      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Get add-on by ID
   * @param {string} addonId - Add-on ID
   * @returns {Promise<Object|null>} Add-on object or null
   */
  async getAddOnById(addonId) {
    const addOns = await this.getAddOns();
    return addOns.find(addon => addon.id === addonId) || null;
  }

  /**
   * Calculate total duration for add-ons
   * @param {string|Array|null|undefined} addOnsData - JSON string of add-on IDs or array
   * @returns {Promise<number>} Total duration in minutes
   */
  async calculateAddOnsDuration(addOnsData) {
    if (!addOnsData) return 0;
    
    try {
      let addOnIds;
      
      // Handle different data types
      if (Array.isArray(addOnsData)) {
        addOnIds = addOnsData;
      } else if (typeof addOnsData === 'string') {
        // If it's a string, check if it's empty or invalid
        if (addOnsData.trim() === '') return 0;
        
        // Handle empty string or invalid JSON
        if (addOnsData === '[]' || addOnsData === 'null' || addOnsData === 'undefined') {
          return 0;
        }
        
        try {
          addOnIds = JSON.parse(addOnsData);
        } catch (parseError) {
          console.error('Error parsing add-ons data as JSON:', parseError);
          return 0;
        }
      } else {
        // For other data types (null, undefined, numbers, etc.), return 0
        return 0;
      }
      
      if (!Array.isArray(addOnIds) || addOnIds.length === 0) return 0;
      
      const addOns = await this.getAddOns();
      
      // Legacy mapping for duration
      const legacyDurationMapping = {
        'addon1': 15, // Beard Trim
        'addon2': 10, // Hot Towel Treatment
        'addon3': 20, // Scalp Massage
        'addon4': 15, // Hair Wash
        'addon5': 20, // Styling
        'addon6': 5,  // Hair Wax Application
        'addon7': 10, // Eyebrow Trim
        'addon8': 5,  // Mustache Trim
        'addon9': 25, // Face Mask
        'addon10': 30 // Hair Treatment
      };
      
      return addOnIds.reduce((total, addonId) => {
        // First try to find by UUID in database
        const addon = addOns.find(a => a.id === addonId);
        if (addon) {
          return total + addon.duration;
        }
        
        // If not found, try legacy mapping
        if (legacyDurationMapping[addonId]) {
          return total + legacyDurationMapping[addonId];
        }
        
        return total;
      }, 0);
    } catch (error) {
      console.error('Error calculating add-ons duration:', error);
      return 0;
    }
  }

  /**
   * Calculate total price for add-ons
   * @param {string|Array|null|undefined} addOnsData - JSON string of add-on IDs or array
   * @returns {Promise<number>} Total price
   */
  async calculateAddOnsPrice(addOnsData) {
    if (!addOnsData) return 0;
    
    try {
      let addOnIds;
      
      // Handle different data types
      if (Array.isArray(addOnsData)) {
        addOnIds = addOnsData;
      } else if (typeof addOnsData === 'string') {
        // If it's a string, check if it's empty or invalid
        if (addOnsData.trim() === '') return 0;
        
        // Handle empty string or invalid JSON
        if (addOnsData === '[]' || addOnsData === 'null' || addOnsData === 'undefined') {
          return 0;
        }
        
        try {
          addOnIds = JSON.parse(addOnsData);
        } catch (parseError) {
          console.error('Error parsing add-ons data as JSON:', parseError);
          return 0;
        }
      } else {
        // For other data types (null, undefined, numbers, etc.), return 0
        return 0;
      }
      
      if (!Array.isArray(addOnIds) || addOnIds.length === 0) return 0;
      
      const addOns = await this.getAddOns();
      
      // Legacy mapping for price
      const legacyPriceMapping = {
        'addon1': 50.00, // Beard Trim
        'addon2': 30.00, // Hot Towel Treatment
        'addon3': 80.00, // Scalp Massage
        'addon4': 40.00, // Hair Wash
        'addon5': 60.00, // Styling
        'addon6': 25.00, // Hair Wax Application
        'addon7': 35.00, // Eyebrow Trim
        'addon8': 20.00, // Mustache Trim
        'addon9': 75.00, // Face Mask
        'addon10': 90.00 // Hair Treatment
      };
      
      return addOnIds.reduce((total, addonId) => {
        // First try to find by UUID in database
        const addon = addOns.find(a => a.id === addonId);
        if (addon) {
          return total + addon.price;
        }
        
        // If not found, try legacy mapping
        if (legacyPriceMapping[addonId]) {
          return total + legacyPriceMapping[addonId];
        }
        
        return total;
      }, 0);
    } catch (error) {
      console.error('Error calculating add-ons price:', error);
      return 0;
    }
  }

  /**
   * Get display text for add-ons
   * @param {string} addOnsData - JSON string of add-on IDs
   * @returns {Promise<string>} Formatted add-ons display text
   */
  async getAddOnsDisplay(addOnsData) {
    if (!addOnsData) return '';
    
    try {
      // Handle different data formats
      let addOnItems;
      if (Array.isArray(addOnsData)) {
        addOnItems = addOnsData;
      } else if (typeof addOnsData === 'string') {
        // Try to parse as JSON first
        try {
          addOnItems = JSON.parse(addOnsData);
        } catch (parseError) {
          // If JSON parsing fails, treat as single UUID string
          console.log('Add-ons data is not JSON, treating as single UUID:', addOnsData);
          addOnItems = [addOnsData];
        }
      } else {
        // Handle other data types
        addOnItems = [addOnsData];
      }
      
      if (!Array.isArray(addOnItems) || addOnItems.length === 0) return '';
      
      // Legacy mapping for addon1, addon2, etc. format
      const legacyMapping = {
        'addon1': 'Beard Trim',
        'addon2': 'Hot Towel Treatment', 
        'addon3': 'Scalp Massage',
        'addon4': 'Hair Wash',
        'addon5': 'Styling',
        'addon6': 'Hair Wax Application',
        'addon7': 'Eyebrow Trim',
        'addon8': 'Mustache Trim',
        'addon9': 'Face Mask',
        'addon10': 'Hair Treatment'
      };
      
      // Map each item to its display name
      const addOnNames = await Promise.all(
        addOnItems
          .filter(item => item !== null && item !== '')
          .map(async (item) => {
            // First try legacy mapping (addon1, addon2, etc.)
            if (legacyMapping[item]) {
              return legacyMapping[item];
            }
            // If it's already a readable name, return as is
            if (typeof item === 'string' && !item.includes('-') && !item.startsWith('addon')) {
              return item;
            }
            // For UUIDs, try to fetch the actual add-on name
            if (typeof item === 'string' && item.includes('-')) {
              try {
                const addOn = await this.getAddOnById(item);
                if (addOn && addOn.name) {
                  return addOn.name;
                }
              } catch (error) {
                console.log('Could not fetch add-on name for ID:', item);
              }
            }
            // Fallback: return truncated version
            return item.length > 20 ? item.substring(0, 20) + '...' : item;
          })
      );
      
      return addOnNames.join(', ');
    } catch (error) {
      console.error('Error parsing add-ons data:', error);
      return '';
    }
  }

  /**
   * Clear cache (useful for testing or when data changes)
   */
  clearCache() {
    this.addOnsCache = null;
    this.lastFetch = null;
    console.log('🗑️ Add-ons cache cleared');
  }
}

// Create singleton instance
const addOnsService = new AddOnsService();
export default addOnsService;
