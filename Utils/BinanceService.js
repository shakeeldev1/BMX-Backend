import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

class BinanceService {
  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY;
    this.apiSecret = process.env.BINANCE_API_SECRET;
    this.baseUrl = process.env.BINANCE_API_URL || 'https://api.binance.com';
  }

  /**
   * Generate signature for Binance API request
   */
  generateSignature(queryString) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Make authenticated request to Binance API
   */
  async makeRequest(endpoint, params = {}) {
    try {
      const timestamp = Date.now();
      const queryString = new URLSearchParams({
        ...params,
        timestamp,
      }).toString();

      const signature = this.generateSignature(queryString);
      const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });

      // Get response text first to handle empty responses
      const responseText = await response.text();
      
      if (!response.ok) {
        // Try to parse error as JSON
        let errorMessage = responseText;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.msg || errorJson.message || responseText;
        } catch (e) {
          // If not JSON, use raw text
        }
        
        console.error('Binance API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
          url: `${this.baseUrl}${endpoint}`,
        });
        
        throw new Error(`Binance API Error (${response.status}): ${errorMessage}`);
      }

      // Handle empty response
      if (!responseText || responseText.trim() === '') {
        console.warn('Binance API returned empty response');
        return [];
      }

      // Parse JSON response
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse Binance response:', responseText);
        throw new Error(`Invalid JSON response from Binance: ${responseText.substring(0, 100)}`);
      }
    } catch (error) {
      console.error('Binance API Request Error:', error.message);
      throw error;
    }
  }

  /**
   * Make authenticated POST request to Binance API
   */
  async makePostRequest(endpoint, params = {}) {
    try {
      const timestamp = Date.now();
      const queryString = new URLSearchParams({
        ...params,
        timestamp,
      }).toString();

      const signature = this.generateSignature(queryString);
      const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Binance API Error: ${error.msg || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Binance API POST Request Error:', error);
      throw error;
    }
  }

  /**
   * Get deposit history from Binance
   * @param {number} startTime - Start time in milliseconds
   * @param {number} endTime - End time in milliseconds
   */
  async getDepositHistory(startTime = null, endTime = null) {
    try {
      const params = {
        coin: 'USDT',
      };

      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;

      const deposits = await this.makeRequest('/sapi/v1/capital/deposit/hisrec', params);
      
      // Filter for TRC20 network only
      return deposits.filter(deposit => deposit.network === 'TRX');
    } catch (error) {
      console.error('Error fetching deposit history:', error);
      throw error;
    }
  }

  /**
   * Create withdrawal request
   * @param {string} address - Withdrawal address
   * @param {number} amount - Amount to withdraw
   * @param {string} network - Network (TRX for TRC20)
   */
  async createWithdrawal(address, amount, network = 'TRX') {
    try {
      const params = {
        coin: 'USDT',
        network: network,
        address: address,
        amount: amount,
      };

      const result = await this.makePostRequest('/sapi/v1/capital/withdraw/apply', params);
      return result;
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      throw error;
    }
  }

  /**
   * Get withdrawal history from Binance
   * @param {number} startTime - Start time in milliseconds
   * @param {number} endTime - End time in milliseconds
   */
  async getWithdrawalHistory(startTime = null, endTime = null) {
    try {
      const params = {
        coin: 'USDT',
      };

      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;

      const withdrawals = await this.makeRequest('/sapi/v1/capital/withdraw/history', params);
      
      // Filter for TRC20 network only
      return withdrawals.filter(withdrawal => withdrawal.network === 'TRX');
    } catch (error) {
      console.error('Error fetching withdrawal history:', error);
      throw error;
    }
  }

  /**
   * Get deposit address
   * @param {string} coin - Coin symbol (USDT)
   * @param {string} network - Network (TRX for TRC20)
   */
  async getDepositAddress(coin = 'USDT', network = 'TRX') {
    try {
      const params = {
        coin: coin,
        network: network,
      };

      const result = await this.makeRequest('/sapi/v1/capital/deposit/address', params);
      return result.address;
    } catch (error) {
      console.error('Error fetching deposit address:', error);
      throw error;
    }
  }
}

export default new BinanceService();
