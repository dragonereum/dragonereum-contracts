const colors = require('colors');

const started = text => hash => {
  if (process.env.DEBUG) {
    console.log('\n    ***** STARTED *****'.blue, `\n    > ${text} \n    > tx: ${hash}`);
  }
}

const done = text => receipt => {
  if (process.env.DEBUG) {
    console.log('\n    ***** DONE *****'.green, `\n    > ${text} \n    > tx: ${receipt.transactionHash} \n    > gasUsed: ${receipt.gasUsed}`);
  }
}

const register = (promise, text) => {
  return promise.on('transactionHash', started(text))
                .on('receipt', done(text));
}

module.exports = register;
