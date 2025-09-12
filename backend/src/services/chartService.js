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
  }

  /**
   * Get supported timeframes mapping
   */
  getSupportedTimeframes() {
    return {
      '1m': { binance: '1m', display: '1 MIN' },
      '5m': { binance: '5m', display: '5 MIN' },
      '15m': { binance: '15m', display: '15 MIN' },
      '30m': { binance: '30m', display: '30 MIN' },
      '1h': { binance: '1h', display: '1 HOUR' },
      '4h': { binance: '4h', display: '4 HOUR' },
      '1d': { binance: '1d', display: '1 DAY' },
      '1w': { binance: '1w', display: '1 WEEK' }
    };
  }

  /**
   * Validate and format cryptocurrency symbol
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   */
  formatSymbol(symbol) {
    if (!symbol) return 'BTCUSDT';
    
    // Convert to uppercase and add USDT if not already present
    const upperSymbol = symbol.toUpperCase();
    if (upperSymbol.endsWith('USDT')) {
      return upperSymbol;
    }
    if (upperSymbol.endsWith('USD')) {
      return upperSymbol.replace('USD', 'USDT');
    }
    return upperSymbol + 'USDT';
  }

  /**
   * Get display name for symbol
   * @param {string} binanceSymbol - Binance symbol (e.g., 'BTCUSDT')
   */
  getDisplaySymbol(binanceSymbol) {
    return binanceSymbol.replace('USDT', '/USD');
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
   * Map trading symbols to CoinGecko IDs
   * @param {string} symbol - Trading symbol (e.g., 'BTC', 'ETH')
   */
  getCoinGeckoId(symbol) {
    const mapping = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'ADA': 'cardano',
      'SOL': 'solana',
      'DOT': 'polkadot',
      'AVAX': 'avalanche-2',
      'MATIC': 'matic-network',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'XRP': 'ripple',
      'DOGE': 'dogecoin',
      'SHIB': 'shiba-inu',
      'ATOM': 'cosmos',
      'NEAR': 'near',
      'FTM': 'fantom',
      'ALGO': 'algorand',
      'VET': 'vechain',
      'MANA': 'decentraland',
      'SAND': 'the-sandbox',
      'GALA': 'gala',
      'CHZ': 'chiliz',
      'ENJ': 'enjincoin',
      'BAT': 'basic-attention-token',
      'ZEC': 'zcash',
      'DASH': 'dash'
    };
    return mapping[symbol] || symbol.toLowerCase();
  }

  /**
   * Fetch token logo from CoinGecko
   * @param {string} symbol - Crypto symbol (e.g., 'BTC')
   */
  async fetchTokenLogo(symbol) {
    try {
      const coinGeckoId = this.getCoinGeckoId(symbol);
      
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
   * Fetch cryptocurrency OHLCV data from Binance
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   * @param {string} interval - Time interval (1h, 4h, 1d, etc.)
   * @param {number} limit - Number of candles to fetch
   */
  async fetchCryptoData(symbol = 'btc', interval = '1d', limit = 90) {
    try {
      const binanceSymbol = this.formatSymbol(symbol);
      const timeframes = this.getSupportedTimeframes();
      const binanceInterval = timeframes[interval]?.binance || '1d';
      
      logger.info('Fetching crypto data from Binance', { 
        symbol: binanceSymbol, 
        interval: binanceInterval, 
        limit 
      });
      
      const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
          symbol: binanceSymbol,
          interval: binanceInterval,
          limit: limit
        }
      });

      const ohlcvData = response.data.map(candle => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));

      logger.info('Successfully fetched OHLCV data', { 
        symbol: binanceSymbol,
        count: ohlcvData.length 
      });
      return ohlcvData;
    } catch (error) {
      logger.error('Error fetching crypto data', { 
        symbol, 
        interval, 
        error: error.message 
      });
      
      if (error.response?.status === 400) {
        throw new Error(`Invalid symbol or timeframe. Symbol: ${symbol}, Timeframe: ${interval}`);
      }
      throw new Error('Failed to fetch market data');
    }
  }

  /**
   * Get current price and 24h change for any cryptocurrency
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'btc', 'eth')
   */
  async getCurrentPrice(symbol = 'btc') {
    try {
      const binanceSymbol = this.formatSymbol(symbol);
      
      const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
        params: { symbol: binanceSymbol }
      });

      const data = response.data;
      return {
        price: parseFloat(data.lastPrice),
        change: parseFloat(data.priceChange),
        changePercent: parseFloat(data.priceChangePercent),
        symbol: binanceSymbol
      };
    } catch (error) {
      logger.error('Error fetching current price', { symbol, error: error.message });
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
