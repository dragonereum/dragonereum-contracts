const Migrations = artifacts.require('./Migrations.sol');

module.exports = async (deployer) => {
  await deployer.deploy(Migrations, { gas: await Migrations.new.estimateGas() });
};
