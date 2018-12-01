const UpgradeController = artifacts.require('./UpgradeController.sol');

const User = artifacts.require('./User.sol');
const MainBase = artifacts.require('./MainBase.sol');
const MainBattle = artifacts.require('./MainBattle.sol');
const MainMarket = artifacts.require('./MainMarket.sol');
const MarketplaceController = artifacts.require('./MarketplaceController.sol');
const CoreController = artifacts.require('./CoreController.sol');
const BattleController = artifacts.require('./BattleController.sol');
const Getter = artifacts.require('./Getter.sol');
const Core = artifacts.require('./Core.sol');
const Nest = artifacts.require('./Nest.sol');
const DragonCore = artifacts.require('./DragonCore.sol');
const DragonLeaderboard = artifacts.require('./DragonLeaderboard.sol');
const DragonGetter = artifacts.require('./DragonGetter.sol');
const DragonParams = artifacts.require('./DragonParams.sol');
const DragonGenetics = artifacts.require('./DragonGenetics.sol');
const DragonCoreHelper = artifacts.require('./DragonCoreHelper.sol');
const EggCore = artifacts.require('./EggCore.sol');
const DragonMarketplace = artifacts.require('./DragonMarketplace.sol');
const BreedingMarketplace = artifacts.require('./BreedingMarketplace.sol');
const EggMarketplace = artifacts.require('./EggMarketplace.sol');
const GoldMarketplace = artifacts.require('./GoldMarketplace.sol');
const GoldMarketplaceStorage = artifacts.require('./GoldMarketplaceStorage.sol');
const SkillMarketplace = artifacts.require('./SkillMarketplace.sol');
const Distribution = artifacts.require('./Distribution.sol');
const Random = artifacts.require('./Random.sol');
const DragonStorage = artifacts.require('./Dragon/DragonStorage.sol');
const EggStorage = artifacts.require('./Egg/EggStorage.sol');
const Battle = artifacts.require('./Battle.sol');
const Gold = artifacts.require('./Gold/Gold.sol');
const Treasury = artifacts.require('./Treasury.sol');
const GladiatorBattle = artifacts.require('./GladiatorBattle.sol');
const GladiatorBattleStorage = artifacts.require('./GladiatorBattleStorage.sol');
const GladiatorBattleSpectators = artifacts.require('./GladiatorBattleSpectators.sol');
const GladiatorBattleSpectatorsStorage = artifacts.require('./GladiatorBattleSpectatorsStorage.sol');
const Events = artifacts.require('./Events.sol');

const DRAGON_TOKEN_NAME = 'Dragonereum Dragon';
const DRAGON_TOKEN_SYMBOL = 'DRAGON';
const EGG_TOKEN_NAME = 'Dragonereum Egg';
const EGG_TOKEN_SYMBOL = 'EGG';

async function estimateGas(contract, ...params) {
  const estimation = await contract.new.estimateGas(...params);
  return { gas: estimation + 300000 };
}

module.exports = async (deployer, network, [account]) => {
  await deployer;

  const dragonStorageParams = [DRAGON_TOKEN_NAME, DRAGON_TOKEN_SYMBOL];
  const eggStorageParams = [EGG_TOKEN_NAME, EGG_TOKEN_SYMBOL];


  await deployer.deploy(UpgradeController, await estimateGas(UpgradeController));
  await deployer.deploy(User, await estimateGas(User));
  await deployer.deploy(Random, await estimateGas(Random));
  await deployer.deploy(
    DragonStorage,
    ...dragonStorageParams,
    await estimateGas(DragonStorage, ...dragonStorageParams)
  );
  await deployer.deploy(DragonParams, await estimateGas(DragonParams));
  await deployer.deploy(DragonCore, await estimateGas(DragonCore));
  await deployer.deploy(DragonLeaderboard, await estimateGas(DragonLeaderboard));
  await deployer.deploy(DragonGetter, await estimateGas(DragonGetter));
  await deployer.deploy(DragonGenetics, await estimateGas(DragonGenetics));
  await deployer.deploy(DragonCoreHelper, await estimateGas(DragonCoreHelper));
  await deployer.deploy(
    EggStorage,
    ...eggStorageParams,
    await estimateGas(EggStorage, ...eggStorageParams)
  );
  await deployer.deploy(EggCore, await estimateGas(EggCore));
  await deployer.deploy(Nest, await estimateGas(Nest));
  await deployer.deploy(Core, await estimateGas(Core));
  await deployer.deploy(DragonMarketplace, await estimateGas(DragonMarketplace));
  await deployer.deploy(BreedingMarketplace, await estimateGas(BreedingMarketplace));
  await deployer.deploy(EggMarketplace, await estimateGas(EggMarketplace));
  await deployer.deploy(GoldMarketplace, await estimateGas(GoldMarketplace));
  await deployer.deploy(GoldMarketplaceStorage, await estimateGas(GoldMarketplaceStorage));
  await deployer.deploy(SkillMarketplace, await estimateGas(SkillMarketplace));
  await deployer.deploy(Distribution, await estimateGas(Distribution));
  await deployer.deploy(Battle, await estimateGas(Battle));
  await deployer.deploy(Treasury, await estimateGas(Treasury));
  await deployer.deploy(Getter, await estimateGas(Getter));
  await deployer.deploy(MarketplaceController, await estimateGas(MarketplaceController));
  await deployer.deploy(CoreController, await estimateGas(CoreController));
  await deployer.deploy(BattleController, await estimateGas(BattleController));
  await deployer.deploy(GladiatorBattle, await estimateGas(GladiatorBattle));
  await deployer.deploy(GladiatorBattleStorage, await estimateGas(GladiatorBattleStorage));
  await deployer.deploy(GladiatorBattleSpectators, await estimateGas(GladiatorBattleSpectators));
  await deployer.deploy(GladiatorBattleSpectatorsStorage, await estimateGas(GladiatorBattleSpectatorsStorage));
  await deployer.deploy(Events, await estimateGas(Events));
  await deployer.deploy(MainBase, await estimateGas(MainBase));
  await deployer.deploy(MainBattle, await estimateGas(MainBattle));
  await deployer.deploy(MainMarket, await estimateGas(MainMarket));

  const treasury = await Treasury.deployed();

  await deployer.deploy(Gold, treasury.address, await estimateGas(Gold, treasury.address));
};
