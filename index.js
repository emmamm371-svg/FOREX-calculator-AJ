require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { getQuery, runQuery, allQuery } = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(BOT_TOKEN);

// ---------- Instrument Configuration ----------
const SYMBOL_CONFIG = {
  'EURUSD': { pipSize: 0.0001, contractSize: 100000 },
  'GBPUSD': { pipSize: 0.0001, contractSize: 100000 },
  'USDJPY': { pipSize: 0.01, contractSize: 100000 },
  'AUDUSD': { pipSize: 0.0001, contractSize: 100000 },
  'USDCAD': { pipSize: 0.0001, contractSize: 100000 },
  'NZDUSD': { pipSize: 0.0001, contractSize: 100000 },
  'USDCHF': { pipSize: 0.0001, contractSize: 100000 },
  'XAUUSD': { pipSize: 0.01, contractSize: 100 },
  'XAGUSD': { pipSize: 0.001, contractSize: 5000 },
  'US30': { pipSize: 1, contractSize: 1 },
  'NAS100': { pipSize: 1, contractSize: 1 },
  'GER40': { pipSize: 1, contractSize: 1 },
  'BTCUSD': { pipSize: 1, contractSize: 1 },
  'ETHUSD': { pipSize: 1, contractSize: 1 },
};

function getSymbolConfig(symbol) {
  const upper = symbol.toUpperCase();
  return SYMBOL_CONFIG[upper] || { pipSize: 0.0001, contractSize: 100000 };
}

// ---------- Calculation Engine ----------
function calculateTrade(entry, stopLoss, balance, riskPercent, symbol) {
  const config = getSymbolConfig(symbol);
  const pipSize = config.pipSize;
  const contractSize = config.contractSize;

  const direction = entry > stopLoss ? 'BUY' : 'SELL';
  const distance = Math.abs(entry - stopLoss);
  const pips = distance / pipSize;
  const riskAmount = balance * (riskPercent / 100);

  const pipValuePerLot = pipSize * contractSize;

  let lots = 0;
  if (pips > 0 && pipValuePerLot > 0) {
    lots = riskAmount / (pips * pipValuePerLot);
    lots = Math.round(lots * 100) / 100;
    if (lots < 0.01) lots = 0.01;
  }

  const tpLevels = [];
  for (let i = 1; i <= 10; i++) {
    let tpPrice;
    if (direction === 'BUY') {
      tpPrice = entry + distance * i;
    } else {
      tpPrice = entry - distance * i;
    }
    const profit = riskAmount * i;
    tpLevels.push({ ratio: i, price: tpPrice, profit });
  }

  return { direction, distance, pips, riskAmount, lots, tpLevels };
}

function formatNumber(num, decimals = 2) {
  return Number(num).toFixed(decimals);
}

function formatResult(entry, stopLoss, balance, riskPercent, currency, symbol, result) {
  const lines = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('📊 TRADE RESULT');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`💰 Balance: ${currency} ${formatNumber(balance)}`);
  lines.push(`⚠️ Risk: ${formatNumber(riskPercent)}%`);
  lines.push(`💵 Risk Amount: ${currency} ${formatNumber(result.riskAmount)}`);
  lines.push(`📈 Entry: ${formatNumber(entry, 4)}`);
  lines.push(`🛑 Stop Loss: ${formatNumber(stopLoss, 4)}`);
  lines.push(`📏 Stop Loss Distance: ${formatNumber(result.distance, 4)} (${formatNumber(result.pips, 1)} pips)`);
  lines.push(`📦 Recommended Lot Size: ${formatNumber(result.lots)} lots`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🎯 TAKE PROFIT LEVELS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');

  result.tpLevels.forEach(tp => {
    lines.push(`✅ TP 1:${tp.ratio}`);
    lines.push(`   Price: ${formatNumber(tp.price, 4)}`);
    lines.push(`   Profit: ${currency} ${formatNumber(tp.profit)}`);
    lines.push('');
  });

  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

// ---------- Keyboards ----------
const mainMenu = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 New Trade', 'new_trade')],
    [Markup.button.callback('⚙️ Settings', 'settings')],
    [Markup.button.callback('📋 Trade History', 'history')],
    [Markup.button.callback('🔄 Reset', 'reset')],
  ]);
};

const settingsMenu = (user) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`💰 Balance: ${user.balance}`, 'edit_balance')],
    [Markup.button.callback(`⚠️ Risk %: ${user.risk_percent}`, 'edit_risk')],
    [Markup.button.callback(`💵 Currency: ${user.currency}`, 'edit_currency')],
    [Markup.button.callback(`📈 Symbol: ${user.symbol}`, 'edit_symbol')],
    [Markup.button.callback('🔙 Back', 'back_main')],
  ]);
};

const currencyKeyboard = () => {
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
  const buttons = currencies.map(c => Markup.button.callback(c, `set_currency_${c}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  rows.push([Markup.button.callback('🔙 Back', 'back_settings')]);
  return Markup.inlineKeyboard(rows);
};

const symbolKeyboard = () => {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'XAUUSD', 'XAGUSD', 'US30', 'NAS100', 'BTCUSD', 'ETHUSD'];
  const buttons = symbols.map(s => Markup.button.callback(s, `set_symbol_${s}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  rows.push([Markup.button.callback('🔙 Back', 'back_settings')]);
  return Markup.inlineKeyboard(rows);
};

// ---------- Bot Handlers ----------
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const user = await getQuery('SELECT * FROM users WHERE user_id = ?', [userId]);

  if (!user) {
    await runQuery('INSERT INTO users (user_id, setup_step) VALUES (?, 1)', [userId]);
    await ctx.reply(
      'Welcome to Forex Risk Bot!\n\nLet\'s set up your account.\n\nPlease enter your **Account Balance** (e.g., 1000):',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (user.setup_step < 5) {
    await continueSetup(ctx, user);
    return;
  }

  await ctx.reply('Welcome back!', mainMenu());
});

// Text handler
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  const user = await getQuery('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!user) {
    await ctx.reply('Please use /start to begin.');
    return;
  }

  // Setup steps
  if (user.setup_step >= 1 && user.setup_step <= 4) {
    await handleSetupInput(ctx, user, text);
    return;
  }

  // Editing balance (step 6)
  if (user.setup_step === 6) {
    const balance = parseFloat(text);
    if (isNaN(balance) || balance <= 0) {
      await ctx.reply('Please enter a valid positive number for Balance.');
      return;
    }
    await runQuery('UPDATE users SET balance = ?, setup_step = 5 WHERE user_id = ?', [balance, userId]);
    const updated = await getQuery('SELECT * FROM users WHERE user_id = ?', [userId]);
    await ctx.reply(`Balance updated to ${balance}.`, settingsMenu(updated));
    return;
  }

  // Editing risk (step 7)
  if (user.setup_step === 7) {
    const risk = parseFloat(text);
    if (isNaN(risk) || risk <= 0 || risk > 100) {
      await ctx.reply('Please enter a valid risk percentage between 0 and 100.');
      return;
    }
    await runQuery('UPDATE users SET risk_percent = ?, setup_step = 5 WHERE user_id = ?', [risk, userId]);
    const updated = await getQuery('SELECT * FROM users WHERE user_id = ?', [userId]);
    await ctx.reply(`Risk percentage updated to ${risk}%.`, settingsMenu(updated));
    return;
  }

  // If setup complete, parse trade input
  if (user.setup_step === 5) {
    const numbers = text.split(/\s+/).filter(s => s.length > 0).map(Number);
    if (numbers.length === 2 && !isNaN(numbers[0]) && !isNaN(numbers[1])) {
      await handleTradeCalculation(ctx, user, numbers[0], numbers[1]);
      return;
    }
    await ctx.reply(
      'Please send two numbers: Entry Price and Stop Loss Price.\nExample: `3350 3345`',
      { parse_mode: 'Markdown' }
    );
  }
});

// Setup functions
async function continueSetup(ctx, user) {
  const step = user.setup_step;
  if (step === 1) {
    await ctx.reply('Please enter your **Account Balance** (e.g., 1000):', { parse_mode: 'Markdown' });
  } else if (step === 2) {
    await ctx.reply('Please enter your **Risk Percentage** (e.g., 1):', { parse_mode: 'Markdown' });
  } else if (step === 3) {
    await ctx.reply('Select your **Account Currency**:', currencyKeyboard());
  } else if (step === 4) {
    await ctx.reply('Select your **Default Trading Symbol**:', symbolKeyboard());
  }
}

async function handleSetupInput(ctx, user, text) {
  const step = user.setup_step;
  const userId = user.user_id;

  if (step === 1) {
    const balance = parseFloat(text);
    if (isNaN(balance) || balance <= 0) {
      await ctx.reply('Please enter a valid positive number for Balance.');
      return;
    }
    await runQuery('UPDATE users SET balance = ?, setup_step = 2 WHERE user_id = ?', [balance, userId]);
    await ctx.reply('Great! Now enter your **Risk Percentage** (e.g., 1 for 1%):', { parse_mode: 'Markdown' });
  } else if (step === 2) {
    const risk = parseFloat(text);
    if (isNaN(risk) || risk <= 0 || risk > 100) {
      await ctx.reply('Please enter a valid risk percentage between 0 and 100.');
      return;
    }
    await runQuery('UPDATE users SET risk_percent = ?, setup_step = 3 WHERE user_id = ?', [risk, userId]);
    await ctx.reply('Select your **Account Currency**:', currencyKeyboard());
  }
}

// Callback queries
bot.action(/^set_currency_(.+)$/, async (ctx) => {
  const currency = ctx.match[1];
  const userId = ctx.from.id;
  await runQuery('UPDATE users SET currency = ?, setup_step = 4 WHERE user_id = ?', [currency, userId]);
  await ctx.answerCbQuery(`Currency set to ${currency}`);
  await ctx.reply('Select your **Default Trading Symbol**:', symbolKeyboard());
});

bot.action(/^set_symbol_(.+)$/, async (ctx) => {
  const symbol = ctx.match[1];
  const userId = ctx.from.id;
  await runQuery('UPDATE users SET symbol = ?, setup_step = 5 WHERE user_id = ?', [symbol, userId]);
  await ctx.answerCbQuery(`Symbol set to ${symbol}`);
  const user = await getQuery('SELECT * FROM users WHERE user_id = ?', [userId]);
  await ctx.reply('Setup complete! You can now start trading.', mainMenu());
});

bot.action('back_settings', async (ctx) => {
  const userId = ctx.from.id;
  const user = await getQuery('SELECT * FROM users WHERE user_id = ?', [userId]);
  await ctx.editMessageText('⚙️ Settings', settingsMenu(user));
  await ctx.answerCbQuery();
});

bot.action('back_main', async (ctx) => {
  await ctx.editMessageText('Main Menu', mainMenu());
  await ctx.answerCbQuery();
});

bot.action('settings', async (ctx) => {
  const userId = ctx.from.id;
  const user = await getQuery('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!user || user.setup_step < 5) {
    await ctx.answerCbQuery('Please complete setup first.');
    return;
  }
  await ctx.editMessageText('⚙️ Settings', settingsMenu(user));
  await ctx.answerCbQuery();
});

bot.action('new_trade', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Please send Entry Price and Stop Loss Price (e.g., `3350 3345`)', { parse_mode: 'Markdown' });
});

bot.action('history', async (ctx) => {
  const userId = ctx.from.id;
  const trades = await allQuery('SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [userId]);
  if (trades.length === 0) {
    await ctx.reply('No trades yet.');
  } else {
    let msg = '📋 Trade History (last 10):\n\n';
    trades.forEach((t, i) => {
      msg += `${i+1}. Entry: ${t.entry}, SL: ${t.stop_loss}, ${t.direction}, Lots: ${t.lots}, Risk: ${t.risk_amount}\n`;
    });
    await ctx.reply(msg);
  }
  await ctx.answerCbQuery();
});

bot.action('reset', async (ctx) => {
  const userId = ctx.from.id;
  await runQuery('DELETE FROM users WHERE user_id = ?', [userId]);
  await ctx.answerCbQuery('Settings reset. Please use /start to set up again.');
  await ctx.reply('Your settings have been reset. Use /start to begin setup.');
});

bot.action('edit_balance', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await runQuery('UPDATE users SET setup_step = 6 WHERE user_id = ?', [userId]);
  await ctx.reply('Enter new Account Balance:');
});

bot.action('edit_risk', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await runQuery('UPDATE users SET setup_step = 7 WHERE user_id = ?', [userId]);
  await ctx.reply('Enter new Risk Percentage:');
});

bot.action('edit_currency', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Select new Account Currency:', currencyKeyboard());
});

bot.action('edit_symbol', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Select new Trading Symbol:', symbolKeyboard());
});

// Trade calculation
async function handleTradeCalculation(ctx, user, entry, stopLoss) {
  const { balance, risk_percent, currency, symbol } = user;
  if (entry === stopLoss) {
    await ctx.reply('Entry and Stop Loss cannot be the same.');
    return;
  }

  const result = calculateTrade(entry, stopLoss, balance, risk_percent, symbol);
  const formatted = formatResult(entry, stopLoss, balance, risk_percent, currency, symbol, result);

  const tpLevelsJSON = JSON.stringify(result.tpLevels);
  await runQuery(
    `INSERT INTO trades (user_id, entry, stop_loss, direction, lots, risk_amount, tp_levels)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.user_id, entry, stopLoss, result.direction, result.lots, result.riskAmount, tpLevelsJSON]
  );

  await ctx.reply(formatted);
  await ctx.reply('What would you like to do next?', mainMenu());
}

// Launch
bot.launch().then(() => {
  console.log('Bot is running...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
