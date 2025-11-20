// Quick script to check .env file configuration
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

console.log('Checking .env file...\n');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found!');
  console.log('\nCreate a .env file with these values:');
  console.log(`
GLORIAFOOD_API_KEY=q8PtGiArHnyyTueFjro9oRhzGY2qFLEef
GLORIAFOOD_STORE_ID=ygQxPUQRJuzWr8bdEX
GLORIAFOOD_MASTER_KEY=dztFbzIojkpSxJoBO6vEF5n2gjLRCgDS4
GLORIAFOOD_API_URL=https://tekmaxllc.com
DATABASE_PATH=./orders.db
POLL_INTERVAL_MS=30000
  `);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

const required = {
  'GLORIAFOOD_API_KEY': false,
  'GLORIAFOOD_STORE_ID': false,
  'GLORIAFOOD_API_URL': false
};

const optional = {
  'GLORIAFOOD_MASTER_KEY': false,
  'DATABASE_PATH': false,
  'POLL_INTERVAL_MS': false
};

lines.forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key] = trimmed.split('=');
    if (required.hasOwnProperty(key)) {
      required[key] = true;
    }
    if (optional.hasOwnProperty(key)) {
      optional[key] = true;
    }
  }
});

console.log('📋 Environment Variables Status:\n');

let allGood = true;
Object.keys(required).forEach(key => {
  if (required[key]) {
    // Extract value for display (mask sensitive)
    const line = lines.find(l => l.trim().startsWith(key + '='));
    const value = line ? line.split('=')[1]?.trim() : '';
    const displayValue = (key.includes('KEY') || key.includes('SECRET')) 
      ? value.substring(0, 8) + '...' 
      : value;
    console.log(`✅ ${key} = ${displayValue}`);
  } else {
    console.log(`❌ ${key} = MISSING`);
    allGood = false;
  }
});

console.log('\n📋 Optional Variables:');
Object.keys(optional).forEach(key => {
  if (optional[key]) {
    const line = lines.find(l => l.trim().startsWith(key + '='));
    const value = line ? line.split('=')[1]?.trim() : '';
    console.log(`✅ ${key} = ${value}`);
  } else {
    console.log(`⚪ ${key} = (not set, using default)`);
  }
});

// Check API URL
const apiUrlLine = lines.find(l => l.trim().startsWith('GLORIAFOOD_API_URL='));
const apiUrl = apiUrlLine ? apiUrlLine.split('=')[1]?.trim() : '';

console.log('\n⚠️  Important Notes:');
if (!apiUrl || apiUrl === 'https://api.gloriafood.com') {
  console.log('⚠️  GLORIAFOOD_API_URL is not set or using default!');
  console.log('   Your API URL should be: https://tekmaxllc.com');
  console.log('   Add this to your .env file: GLORIAFOOD_API_URL=https://tekmaxllc.com');
  allGood = false;
} else if (apiUrl && apiUrl !== 'https://api.gloriafood.com') {
  console.log(`✅ API URL is set to custom domain: ${apiUrl}`);
  console.log('   Note: If polling doesn\'t work, your API might only support webhooks.');
  console.log('   In that case, use: npm run webhook');
}

if (!allGood) {
  console.log('\n❌ Please fix the missing variables and try again.');
  process.exit(1);
} else {
  console.log('\n✅ All required variables are set!');
  console.log('\n💡 Next steps:');
  console.log('   - For polling mode: npm run dev');
  console.log('   - For webhook mode: npm run webhook');
}

