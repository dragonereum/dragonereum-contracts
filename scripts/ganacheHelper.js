
function send (method, params = []) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    }, (err, res) => {
      return err ? reject(err) : resolve(res);
    });
  });
}

// const send = (method, params = []) =>
//   web3.currentProvider.send({ id, jsonrpc, method, params })


const takeSnapshot = async seconds => {
  return await send('evm_snapshot');
}

const revertSnapshot = async (id) => {
  await send('evm_revert', [id]);
}

const mineBlock = async (timestamp) => {
  await send('evm_mine', [timestamp]);
}

const minerStop = async () => {
  await send('miner_stop', []);
}

const minerStart = async () => {
  await send('miner_start', []);
}

module.exports = {
  takeSnapshot,
  revertSnapshot,
  mineBlock,
  minerStop,
  minerStart
}
