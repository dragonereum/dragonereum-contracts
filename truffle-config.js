const dotenv = require('dotenv');
const HDWalletProvider = require('truffle-hdwallet-provider');
const NonceTrackerSubprovider = require('web3-provider-engine/subproviders/nonce-tracker');
const Web3 = require('web3');

const { toWei } = Web3.utils;

dotenv.config();
dotenv.config({ path: '.env.local' });

const getProvider = urlOrProvider => () => {
  const wallet = new HDWalletProvider(process.env.MNEMONIC, urlOrProvider);
  const nonceTracker = new NonceTrackerSubprovider();

  wallet.engine._providers.unshift(nonceTracker);
  nonceTracker.setEngine(wallet.engine);

  return wallet;
};

function infuraWSProvider(network) {
    const url = `wss://${network}.infura.io/ws/v3/${process.env.INFURA_PROJECT_ID}`;
    return new Web3.providers.WebsocketProvider(url);
}

module.exports = {
  contracts_build_directory: `${__dirname}/build_contracts`,
  networks: {
    development: {
      host: 'localhost',
      port: 7545,
      network_id: '*',
      gasPrice: toWei('20', 'gwei'),
      websockets: false,
      gas: 6700000,
    },

    live: {
      provider: getProvider('http://127.0.0.1:8545'),
      network_id: 1,
      gasPrice: toWei('20', 'gwei'),
      websockets: false,
      skipDryRun: true,
      timeoutBlocks: 200,
      gas: 6700000,
      confirmations: 0,
    },
    kovan: {
      provider: getProvider(infuraWSProvider('kovan')),
      network_id: 42,
      gasPrice: toWei('20', 'gwei'),
      websockets: true,
      skipDryRun: true,
      timeoutBlocks: 200,
      gas: 6700000,
      confirmations: 0,
    },
    rinkeby: {
      provider: getProvider(infuraWSProvider('rinkeby')),
      network_id: 4,
      gasPrice: toWei('20', 'gwei'),
      websockets: true,
      skipDryRun: true,
      timeoutBlocks: 200,
      gas: 6700000,
      confirmations: 0,
    },
  },
  compilers: {
    solc: {
      version: '0.4.25',
      optimizer: {
        enabled: true,
        runs: 200
      }
    },
  },
  mocha: {
    enableTimeouts: false
  }
};
