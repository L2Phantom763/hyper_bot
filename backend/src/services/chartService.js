import sharp from 'sharp';
import axios from 'axios';
import { logger } from '../utils/logger.js';

/**
 * Chart service for generating BTC/USD candlestick charts in TradingView style
 */
export class ChartService {
  constructor() {
    // Chart configuration matching TradingView dark theme
    this.chartConfig = {
      width: 1200,
      height: 600,
      backgroundColor: '#0D1421', // Dark background
      margin: { top: 80, right: 80, bottom: 60, left: 60 },
      colors: {
        background: '#0D1421',
        grid: '#2A2E39',
        text: '#8B949E',
        textBright: '#FFFFFF',
        bullish: '#00C851',
        bearish: '#FF4444'
      }
    };
    
    // Cache for CoinGecko ID lookups to avoid repeated API calls
    this.coinGeckoIdCache = new Map();
  }

  /**
   * Get supported timeframes mapping for CoinGecko
   */
  getSupportedTimeframes() {
    return {
      '1d': { days: 1, display: '1 DAY' },
      '7d': { days: 7, display: '7 DAYS' },
      '14d': { days: 14, display: '14 DAYS' },
      '30d': { days: 30, display: '30 DAYS' },
      '90d': { days: 90, display: '90 DAYS' },
      '180d': { days: 180, display: '180 DAYS' },
      '1y': { days: 365, display: '1 YEAR' }
    };
  }

  /**
   * Validate and format cryptocurrency symbol for CoinGecko
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   */
  formatSymbol(symbol) {
    if (!symbol) return 'BTC';
    
    // Convert to uppercase and remove USDT/USD suffixes for CoinGecko
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol.endsWith('USDT')) {
      return upperSymbol.replace('USDT', '');
    }
    if (upperSymbol.endsWith('USD')) {
      return upperSymbol.replace('USD', '');
    }
    return upperSymbol;
  }

  /**
   * Get display name for symbol
   * @param {string} symbol - Crypto symbol (e.g., 'BTC')
   */
  getDisplaySymbol(symbol) {
    return `${symbol}/USD`;
  }

  /**
   * Get crypto icon/symbol for display (fallback)
   * @param {string} symbol - Crypto symbol (e.g., 'BTC', 'ETH')
   */
  getCryptoIcon(symbol) {
    const icons = {
      'BTC': '₿',
      'ETH': 'Ξ',
      'BNB': 'BNB',
      'ADA': '₳',
      'SOL': '◎',
      'DOT': '●',
      'AVAX': '▲',
      'MATIC': '⬟',
      'LINK': '⬢',
      'UNI': '🦄'
    };
    return icons[symbol] || symbol;
  }

  /**
   * Dynamically find CoinGecko ID for any cryptocurrency symbol
   * @param {string} symbol - Trading symbol (e.g., 'BTC', 'ETH', 'PEPE')
   */
  async getCoinGeckoId(symbol) {
    // Check cache first
    if (this.coinGeckoIdCache.has(symbol)) {
      return this.coinGeckoIdCache.get(symbol);
    }

    // Try common direct mappings first (most popular tokens)
    const directMappings = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum', 
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'SOL': 'solana',
      'DOGE': 'dogecoin',
      'AVAX': 'avalanche-2',
      'DOT': 'polkadot'
    };

    if (directMappings[symbol]) {
      this.coinGeckoIdCache.set(symbol, directMappings[symbol]);
      return directMappings[symbol];
    }

    try {
      // First, try the symbol as lowercase (works for many tokens)
      const lowercaseSymbol = symbol.toLowerCase();
      
      logger.info('Trying direct CoinGecko ID lookup', { symbol, attempt: lowercaseSymbol });
      
      const directResponse = await axios.get(`https://api.coingecko.com/api/v3/coins/${lowercaseSymbol}`, {
        timeout: 5000,
        params: {
          localization: false,
          tickers: false,
          market_data: false,
          community_data: false,
          developer_data: false,
          sparkline: false
        }
      });

      if (directResponse.data && directResponse.data.id) {
        this.coinGeckoIdCache.set(symbol, lowercaseSymbol);
        logger.info('Found CoinGecko ID directly', { symbol, coinGeckoId: lowercaseSymbol });
        return lowercaseSymbol;
      }
    } catch (directError) {
      // If direct lookup fails, try search API
      logger.info('Direct lookup failed, trying search API', { symbol });
      
      try {
        const searchResponse = await axios.get('https://api.coingecko.com/api/v3/search', {
          params: { query: symbol },
          timeout: 5000
        });

        const coins = searchResponse.data.coins || [];
        
        // Look for exact symbol match first
        const exactMatch = coins.find(coin => 
          coin.symbol && coin.symbol.toUpperCase() === symbol.toUpperCase()
        );

        if (exactMatch) {
          this.coinGeckoIdCache.set(symbol, exactMatch.id);
          logger.info('Found CoinGecko ID via search (exact match)', { 
            symbol, 
            coinGeckoId: exactMatch.id 
          });
          return exactMatch.id;
        }

        // If no exact match, try first result that contains the symbol
        const partialMatch = coins.find(coin => 
          coin.symbol && coin.symbol.toUpperCase().includes(symbol.toUpperCase())
        );

        if (partialMatch) {
          this.coinGeckoIdCache.set(symbol, partialMatch.id);
          logger.info('Found CoinGecko ID via search (partial match)', { 
            symbol, 
            coinGeckoId: partialMatch.id 
          });
          return partialMatch.id;
        }

      } catch (searchError) {
        logger.warn('CoinGecko search failed', { symbol, error: searchError.message });
      }
    }

    // Fallback: use symbol as lowercase
    const fallbackId = symbol.toLowerCase();
    this.coinGeckoIdCache.set(symbol, fallbackId);
    logger.warn('Using fallback CoinGecko ID', { symbol, fallbackId });
    return fallbackId;
  }

  /**
   * Fetch token logo from CoinGecko
   * @param {string} symbol - Crypto symbol (e.g., 'BTC')
   */
  async fetchTokenLogo(symbol) {
    try {
      const coinGeckoId = await this.getCoinGeckoId(symbol);
      
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinGeckoId}`, {
        timeout: 5000, // 5 second timeout
        params: {
          localization: false,
          tickers: false,
          market_data: false,
          community_data: false,
          developer_data: false,
          sparkline: false
        }
      });

      const logoUrl = response.data.image?.large || response.data.image?.small;
      
      if (logoUrl) {
        // Fetch the actual logo image
        const logoResponse = await axios.get(logoUrl, {
          responseType: 'arraybuffer',
          timeout: 5000
        });
        
        // Convert to base64 for SVG embedding
        const logoBase64 = Buffer.from(logoResponse.data).toString('base64');
        const logoDataUri = `data:image/png;base64,${logoBase64}`;
        
        logger.info('Successfully fetched token logo', { symbol, coinGeckoId });
        return logoDataUri;
      }
    } catch (error) {
      logger.warn('Failed to fetch token logo', { symbol, error: error.message });
    }
    
    return null; // Return null if logo fetch fails
  }

  /**
   * Fetch cryptocurrency OHLCV data from CoinGecko
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   * @param {string} interval - Time interval (1d, 7d, 30d, etc.)
   * @param {number} limit - Not used for CoinGecko (uses days parameter)
   */
  async fetchCryptoData(symbol = 'btc', interval = '1d', limit = 90) {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const coinGeckoId = await this.getCoinGeckoId(formattedSymbol);
      const timeframes = this.getSupportedTimeframes();
      const days = timeframes[interval]?.days || 30;
      
      logger.info('Fetching crypto data from CoinGecko', { 
        symbol: formattedSymbol,
        coinGeckoId,
        interval,
        days
      });
      
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinGeckoId}/ohlc`, {
        params: {
          vs_currency: 'usd',
          days: days
        },
        timeout: 10000
      });

      const ohlcvData = response.data.map(candle => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: 0 // CoinGecko OHLC endpoint doesn't provide volume
      }));

      logger.info('Successfully fetched OHLCV data from CoinGecko', { 
        symbol: formattedSymbol,
        coinGeckoId,
        count: ohlcvData.length 
      });
      return ohlcvData;
    } catch (error) {
      logger.error('Error fetching crypto data from CoinGecko', { 
        symbol, 
        interval, 
        error: error.message 
      });
      
      if (error.response?.status === 404) {
        throw new Error(`Token not found on CoinGecko: ${symbol}`);
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error('Failed to fetch market data from CoinGecko');
    }
  }

  /**
   * Get current price and 24h change for any cryptocurrency from CoinGecko
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   */
  async getCurrentPrice(symbol = 'btc') {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const coinGeckoId = await this.getCoinGeckoId(formattedSymbol);
      
      logger.info('Fetching current price from CoinGecko', { 
        symbol: formattedSymbol,
        coinGeckoId 
      });
      
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: coinGeckoId,
          vs_currencies: 'usd',
          include_24hr_change: true
        },
        timeout: 10000
      });

      const data = response.data[coinGeckoId];
      if (!data) {
        throw new Error(`Price data not found for ${symbol}`);
      }

      return {
        price: parseFloat(data.usd),
        change: 0, // CoinGecko doesn't provide absolute change, only percentage
        changePercent: parseFloat(data.usd_24h_change || 0),
        symbol: formattedSymbol
      };
    } catch (error) {
      logger.error('Error fetching current price from CoinGecko', { 
        symbol, 
        error: error.message 
      });
      
      if (error.response?.status === 404) {
        throw new Error(`Token not found on CoinGecko: ${symbol}`);
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`Failed to fetch current price for ${symbol}`);
    }
  }

  /**
   * Calculate chart scaling and positioning
   * @param {Array} ohlcvData - OHLCV data array
   */
  calculateScaling(ohlcvData) {
    const prices = ohlcvData.flatMap(candle => [candle.high, candle.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1; // 10% padding

    const chartArea = {
      left: this.chartConfig.margin.left,
      right: this.chartConfig.width - this.chartConfig.margin.right,
      top: this.chartConfig.margin.top,
      bottom: this.chartConfig.height - this.chartConfig.margin.bottom
    };

    return {
      minPrice: minPrice - padding,
      maxPrice: maxPrice + padding,
      priceRange: maxPrice - minPrice + (padding * 2),
      chartArea,
      candleWidth: (chartArea.right - chartArea.left) / ohlcvData.length * 0.8
    };
  }

  /**
   * Generate SVG chart
   * @param {Array} ohlcvData - OHLCV data array
   * @param {Object} priceInfo - Current price information
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string|null} logoDataUri - Token logo as data URI
   */
  generateSVG(ohlcvData, priceInfo, symbol = 'btc', interval = '1d', logoDataUri = null) {
    const scaling = this.calculateScaling(ohlcvData);
    
    // Helper function to convert price to Y coordinate
    const priceToY = (price) => {
      const ratio = (scaling.maxPrice - price) / scaling.priceRange;
      return scaling.chartArea.top + ratio * (scaling.chartArea.bottom - scaling.chartArea.top);
    };

    let svg = `
      <svg width="${this.chartConfig.width}" height="${this.chartConfig.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            .bg { fill: ${this.chartConfig.colors.background}; }
            .grid { stroke: ${this.chartConfig.colors.grid}; stroke-width: 1; }
            .text { fill: ${this.chartConfig.colors.text}; font-family: Arial, sans-serif; }
            .text-bright { fill: ${this.chartConfig.colors.textBright}; font-family: Arial, sans-serif; }
            .bullish { fill: ${this.chartConfig.colors.bullish}; stroke: ${this.chartConfig.colors.bullish}; }
            .bearish { fill: ${this.chartConfig.colors.bearish}; stroke: ${this.chartConfig.colors.bearish}; }
          </style>
        </defs>
        
        <!-- Background -->
        <rect class="bg" width="100%" height="100%"/>
        
        <!-- Grid lines -->
    `;

    // Horizontal grid lines
    for (let i = 0; i <= 8; i++) {
      const y = scaling.chartArea.top + (scaling.chartArea.bottom - scaling.chartArea.top) * i / 8;
      svg += `<line class="grid" x1="${scaling.chartArea.left}" y1="${y}" x2="${scaling.chartArea.right}" y2="${y}"/>`;
    }

    // Vertical grid lines
    for (let i = 0; i <= 6; i++) {
      const x = scaling.chartArea.left + (scaling.chartArea.right - scaling.chartArea.left) * i / 6;
      svg += `<line class="grid" x1="${x}" y1="${scaling.chartArea.top}" x2="${x}" y2="${scaling.chartArea.bottom}"/>`;
    }

    // Draw candlesticks
    ohlcvData.forEach((candle, index) => {
      const x = scaling.chartArea.left + 
                (scaling.chartArea.right - scaling.chartArea.left) * 
                (index + 0.5) / ohlcvData.length;
      
      const isBullish = candle.close > candle.open;
      const candleClass = isBullish ? 'bullish' : 'bearish';
      
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 1;
      const bodyWidth = scaling.candleWidth;

      // Wick line
      svg += `<line class="${candleClass}" x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke-width="1"/>`;
      
      // Body rectangle
      svg += `<rect class="${candleClass}" x="${x - bodyWidth / 2}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" stroke-width="1"/>`;
    });

    // Price labels
    for (let i = 0; i <= 8; i++) {
      const price = scaling.maxPrice - (scaling.priceRange * i / 8);
      const y = scaling.chartArea.top + (scaling.chartArea.bottom - scaling.chartArea.top) * i / 8;
      svg += `<text class="text" x="${scaling.chartArea.right + 10}" y="${y + 4}" font-size="11">$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>`;
    }

    // Time labels
    for (let i = 0; i <= 6; i++) {
      const dataIndex = Math.floor(ohlcvData.length * i / 6);
      if (dataIndex < ohlcvData.length) {
        const candle = ohlcvData[dataIndex];
        const date = new Date(candle.timestamp);
        const label = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        
        const x = scaling.chartArea.left + (scaling.chartArea.right - scaling.chartArea.left) * i / 6;
        svg += `<text class="text" x="${x}" y="${scaling.chartArea.bottom + 20}" font-size="11" text-anchor="middle">${label}</text>`;
      }
    }

    // Overlays
    const centerX = this.chartConfig.width / 2;
    const price = `$${priceInfo.price.toLocaleString('en-US', { maximumFractionDigits: priceInfo.price < 1 ? 6 : 2 })}`;
    const changePercent = `${priceInfo.changePercent >= 0 ? '+' : ''}${priceInfo.changePercent.toFixed(2)}%`;
    const changeColor = priceInfo.changePercent >= 0 ? this.chartConfig.colors.bullish : this.chartConfig.colors.bearish;
    
    // Get display information
    const displaySymbol = this.getDisplaySymbol(priceInfo.symbol);
    const timeframes = this.getSupportedTimeframes();
    const displayInterval = timeframes[interval]?.display || '30 DAYS';
    
    // Get crypto symbol for logo (first part before /)
    const cryptoSymbol = displaySymbol.split('/')[0];
    const cryptoIcon = this.getCryptoIcon(cryptoSymbol);

    // Crypto logo and symbol label (top-left)
    if (logoDataUri) {
      // Use actual token logo
      svg += `
        <image x="20" y="15" width="30" height="30" href="${logoDataUri}" />
        <text class="text-bright" x="55" y="35" font-size="16" font-weight="bold">${displaySymbol}</text>
        <text class="text" x="55" y="52" font-size="12">${displayInterval}</text>
      `;
    } else {
      // Fallback to text icon
      svg += `
        <text class="text-bright" x="30" y="35" font-size="16" font-weight="bold">${cryptoIcon}</text>
        <text class="text-bright" x="55" y="35" font-size="16" font-weight="bold">${displaySymbol}</text>
        <text class="text" x="55" y="52" font-size="12">${displayInterval}</text>
      `;
    }

    // Current price and change (top-center)
    svg += `
      <text class="text-bright" x="${centerX - 30}" y="40" font-size="24" font-weight="bold" text-anchor="middle">${price}</text>
      <text x="${centerX + 50}" y="40" font-size="16" font-weight="bold" fill="${changeColor}" text-anchor="middle">${changePercent}</text>
    `;

    // Custom badge (top-right)
    const badgeX = this.chartConfig.width - 120;
    svg += `
      <rect x="${badgeX}" y="20" width="100" height="30" rx="15" fill="${this.chartConfig.colors.grid}"/>
      <text class="text-bright" x="${badgeX + 50}" y="40" font-size="12" font-weight="bold" text-anchor="middle">purrptrade</text>
    `;

    svg += '</svg>';
    return svg;
  }


  /**
   * Generate complete cryptocurrency chart with overlays
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   * @param {string} interval - Time interval (1h, 4h, 1d, etc.)
   */
  async generateChart(symbol = 'btc', interval = '1d') {
    try {
      logger.info('Starting chart generation', { symbol, interval });

      // Validate inputs
      const timeframes = this.getSupportedTimeframes();
      if (!timeframes[interval]) {
        throw new Error(`Unsupported timeframe: ${interval}. Supported: ${Object.keys(timeframes).join(', ')}`);
      }

      // Fetch market data, current price, and token logo in parallel
      const [ohlcvData, priceInfo, logoDataUri] = await Promise.all([
        this.fetchCryptoData(symbol, interval),
        this.getCurrentPrice(symbol),
        this.fetchTokenLogo(symbol.toUpperCase())
      ]);

      // Generate SVG with logo
      logger.info('Generating SVG chart with logo', { symbol, hasLogo: !!logoDataUri });
      const svgString = this.generateSVG(ohlcvData, priceInfo, symbol, interval, logoDataUri);

      // Convert SVG to PNG using Sharp
      logger.info('Converting SVG to PNG');
      const chartBuffer = await sharp(Buffer.from(svgString))
        .png()
        .toBuffer();

      logger.info('Chart generation completed successfully', { symbol, interval, withLogo: !!logoDataUri });
      return chartBuffer;

    } catch (error) {
      logger.error('Error generating chart', { symbol, interval, error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
export const chartService = new ChartService();
