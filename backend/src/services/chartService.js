import sharp from 'sharp';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
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
    
    // Load tokens data
    this.tokensData = this.loadTokensData();
  }

  /**
   * Get supported timeframes mapping for Hyperliquid
   */
  getSupportedTimeframes() {
    return {
      '1m': { hyperliquid: '1m', display: '1 MIN' },
      '5m': { hyperliquid: '5m', display: '5 MIN' },
      '15m': { hyperliquid: '15m', display: '15 MIN' },
      '30m': { hyperliquid: '30m', display: '30 MIN' },
      '1h': { hyperliquid: '1h', display: '1 HOUR' },
      '4h': { hyperliquid: '4h', display: '4 HOUR' },
      '1d': { hyperliquid: '1d', display: '1 DAY' },
      '1w': { hyperliquid: '1w', display: '1 WEEK' }
    };
  }

  /**
   * Validate and format cryptocurrency symbol for Hyperliquid
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth', 'purr/usdc')
   */
  formatSymbol(symbol) {
    if (!symbol) return 'BTC';
    
    // Handle special case for PURR/USDC
    const lowerSymbol = symbol.toLowerCase();
    if (lowerSymbol === 'purr/usdc') {
      return 'PURR/USDC';
    }
    
    // Convert to uppercase and remove any USDT/USD suffix for Hyperliquid
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
   * @param {string} hyperliquidSymbol - Hyperliquid symbol (e.g., 'BTC', 'PURR/USDC')
   */
  getDisplaySymbol(hyperliquidSymbol) {
    // Handle special case for PURR/USDC which already contains the quote currency
    if (hyperliquidSymbol === 'PURR/USDC') {
      return hyperliquidSymbol;
    }
    return hyperliquidSymbol + '/USD';
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
   * Load tokens data from tokensId.json
   */
  loadTokensData() {
    try {
      const filePath = path.join(process.cwd(), 'data', 'tokensId.json');
      const data = fs.readFileSync(filePath, 'utf8');
      const tokens = JSON.parse(data);
      
      // Create a lookup map by symbol for faster access
      const tokenMap = new Map();
      tokens.forEach(token => {
        tokenMap.set(token.symbol.toLowerCase(), token);
      });
      
      logger.info('Successfully loaded tokens data', { count: tokens.length });
      return tokenMap;
    } catch (error) {
      logger.error('Failed to load tokens data', { error: error.message });
      return new Map();
    }
  }
  
  /**
   * Get token data by symbol
   * @param {string} symbol - Trading symbol (e.g., 'BTC', 'ETH')
   */
  getTokenData(symbol) {
    const normalizedSymbol = symbol.toLowerCase();
    return this.tokensData.get(normalizedSymbol) || null;
  }

  /**
   * Detect image format from URL or content type
   * @param {string} url - Image URL
   * @param {string} contentType - Content-Type header from response
   */
  detectImageFormat(url, contentType) {
    // First try to detect from content-type header
    if (contentType) {
      if (contentType.includes('image/png')) return 'image/png';
      if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) return 'image/jpeg';
      if (contentType.includes('image/gif')) return 'image/gif';
      if (contentType.includes('image/webp')) return 'image/webp';
      if (contentType.includes('image/svg')) return 'image/svg+xml';
    }
    
    // Fallback to URL extension detection
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.png')) return 'image/png';
    if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'image/jpeg';
    if (urlLower.includes('.gif')) return 'image/gif';
    if (urlLower.includes('.webp')) return 'image/webp';
    if (urlLower.includes('.svg')) return 'image/svg+xml';
    
    // Default to PNG if unable to detect
    return 'image/png';
  }

  /**
   * Fetch token logo from tokensId.json data
   * @param {string} symbol - Crypto symbol (e.g., 'BTC')
   */
  async fetchTokenLogo(symbol) {
    try {
      const tokenData = this.getTokenData(symbol);
      
      if (!tokenData || !tokenData.image) {
        logger.warn('No token data or image found', { symbol });
        return null;
      }
      
      // Fetch the logo image directly from the URL
      const logoResponse = await axios.get(tokenData.image, {
        responseType: 'arraybuffer',
        timeout: 5000
      });
      
      // Detect the correct image format
      const imageFormat = this.detectImageFormat(
        tokenData.image, 
        logoResponse.headers['content-type']
      );
      
      // Convert to base64 for SVG embedding with correct MIME type
      const logoBase64 = Buffer.from(logoResponse.data).toString('base64');
      const logoDataUri = `data:${imageFormat};base64,${logoBase64}`;
      
      logger.info('Successfully fetched token logo from tokensId.json', { 
        symbol, 
        tokenId: tokenData.id, 
        imageFormat,
        url: tokenData.image 
      });
      return logoDataUri;
      
    } catch (error) {
      logger.warn('Failed to fetch token logo', { symbol, error: error.message });
    }
    
    return null; // Return null if logo fetch fails
  }

  /**
   * Fetch cryptocurrency OHLCV data from Hyperliquid
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   * @param {string} interval - Time interval (15m, 1h, 4h, 1d)
   * @param {number} limit - Number of candles to fetch (max 5000)
   */
  async fetchCryptoData(symbol = 'btc', interval = '1h', limit = 90) {
    try {
      const hyperliquidSymbol = this.formatSymbol(symbol);
      const timeframes = this.getSupportedTimeframes();
      const hyperliquidInterval = timeframes[interval]?.hyperliquid || '1h';
      
      logger.info('Fetching crypto data from Hyperliquid', { 
        symbol: hyperliquidSymbol, 
        interval: hyperliquidInterval, 
        limit 
      });
      
      // Calculate start and end times for the requested number of candles
      const endTime = Date.now();
      const intervalMs = {
        '1m': 1 * 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000
      };
      const startTime = endTime - (limit * intervalMs[hyperliquidInterval]);
      
      const response = await axios.post('https://api.hyperliquid.xyz/info', {
        type: 'candleSnapshot',
        req: {
          coin: hyperliquidSymbol,
          interval: hyperliquidInterval,
          startTime: startTime,
          endTime: endTime
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const ohlcvData = response.data.map(candle => ({
        timestamp: candle.t, // start time of the candle
        open: parseFloat(candle.o),
        high: parseFloat(candle.h),
        low: parseFloat(candle.l),
        close: parseFloat(candle.c),
        volume: parseFloat(candle.v)
      }));

      logger.info('Successfully fetched OHLCV data from Hyperliquid', { 
        symbol: hyperliquidSymbol,
        count: ohlcvData.length 
      });
      return ohlcvData;
    } catch (error) {
      logger.error('Error fetching crypto data from Hyperliquid', { 
        symbol, 
        interval, 
        error: error.message 
      });
      
      if (error.response?.status === 400) {
        throw new Error(`Invalid symbol or timeframe. Symbol: ${symbol}, Timeframe: ${interval}`);
      }
      throw new Error('Failed to fetch market data from Hyperliquid');
    }
  }

  /**
   * Get current price and 24h change from the latest candle data
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   */
  async getCurrentPrice(symbol = 'btc') {
    try {
      const hyperliquidSymbol = this.formatSymbol(symbol);
      
      // Fetch the latest candles to get current price and calculate 24h change
      const endTime = Date.now();
      const startTime = endTime - (25 * 60 * 60 * 1000); // 25 hours to get 24h data
      
      const response = await axios.post('https://api.hyperliquid.xyz/info', {
        type: 'candleSnapshot',
        req: {
          coin: hyperliquidSymbol,
          interval: '1h',
          startTime: startTime,
          endTime: endTime
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const candles = response.data;
      if (!candles || candles.length === 0) {
        throw new Error('No price data available');
      }

      // Sort by timestamp to ensure correct order
      candles.sort((a, b) => a.t - b.t);
      
      const latestCandle = candles[candles.length - 1];
      const price = parseFloat(latestCandle.c);
      
      // Calculate 24h change if we have enough data
      let changePercent = 0;
      let change = 0;
      
      if (candles.length >= 24) {
        const candle24hAgo = candles[candles.length - 24];
        const price24hAgo = parseFloat(candle24hAgo.c);
        change = price - price24hAgo;
        changePercent = (change / price24hAgo) * 100;
      }

      return {
        price: price,
        change: change,
        changePercent: changePercent,
        symbol: hyperliquidSymbol
      };
    } catch (error) {
      logger.error('Error fetching current price from Hyperliquid', { symbol, error: error.message });
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
  generateSVG(ohlcvData, priceInfo, symbol = 'btc', interval = '1h', logoDataUri = null) {
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
    const displayInterval = timeframes[interval]?.display || '1 DAY';
    
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
  async generateChart(symbol = 'btc', interval = '1h') {
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
