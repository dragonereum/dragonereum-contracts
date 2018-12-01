const resolveDependencies = require('./helpers/resolve_contracts_dependencies');
const logger = require('./helpers/logger');

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

const NONSENSE_MULTISIG = '0x10208FB4Ef202BdC49803995b0A8CA185383bba4';

module.exports = async (deployer) => {
  await deployer;

  const upgradeController = await UpgradeController.deployed();

  const contracts = await Promise.all([
    EggStorage.deployed(),
    DragonStorage.deployed(),
    DragonParams.deployed(),
    User.deployed(),
    Gold.deployed(),
    Random.deployed(),
    DragonCore.deployed(),
    DragonLeaderboard.deployed(),
    DragonGetter.deployed(),
    DragonGenetics.deployed(),
    DragonCoreHelper.deployed(),
    EggCore.deployed(),
    Nest.deployed(),
    Core.deployed(),
    DragonMarketplace.deployed(),
    BreedingMarketplace.deployed(),
    EggMarketplace.deployed(),
    GoldMarketplace.deployed(),
    GoldMarketplaceStorage.deployed(),
    SkillMarketplace.deployed(),
    Distribution.deployed(),
    Battle.deployed(),
    Treasury.deployed(),
    Getter.deployed(),
    MarketplaceController.deployed(),
    CoreController.deployed(),
    BattleController.deployed(),
    GladiatorBattle.deployed(),
    GladiatorBattleStorage.deployed(),
    GladiatorBattleSpectators.deployed(),
    GladiatorBattleSpectatorsStorage.deployed(),
    Events.deployed(),
    MainBase.deployed(),
    MainBattle.deployed(),
    MainMarket.deployed(),
  ]);

  const [
    eggStorage,
    dragonStorage,
    dragonParams,
  ] = contracts;

  await resolveDependencies(contracts, artifacts);


  await Promise.all([
    logger(
      eggStorage.setUrl('https://dapp.dragonereum.io/eggs/', { gas: 100000 }),
      'eggStorage.setUrl'
    ),
    logger(
      dragonStorage.setUrl('https://dapp.dragonereum.io/dragons/', { gas: 100000 }),
      'dragonStorage.setUrl'
    ),
    logger(
      dragonParams.setDragonTypesFactors([
        [10, 10, 15, 10, 10],
        [15, 10, 10, 10, 10],
        [10, 10, 10, 15, 10],
        [10, 15, 10, 10, 10],
        [10, 10, 10, 10, 15],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ], { gas: 2100000 }),
      'setDragonTypesFactors'
    ),
    logger(
      dragonParams.setBodyPartsFactors([
        [1, 0, 1, 0, 1],
        [0, 1, 0, 1, 1],
        [1, 1, 0, 0, 1],
        [1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1],
        [1, 0, 1, 1, 0],
        [0, 1, 1, 1, 0],
        [1, 0, 1, 1, 0],
        [1, 1, 0, 0, 1],
        [0, 1, 0, 1, 1],
      ], { gas: 2000000 }),
      'setBodyPartsFactors'
    ),
    logger(
      dragonParams.setGeneTypesFactors([
        [5, 5, 5, 5, 5],
        [15, 15, 10, 10, 10],
        [10, 15, 15, 10, 10],
        [10, 10, 15, 15, 10],
        [10, 10, 10, 15, 15],
        [20, 20, 20, 10, 10],
        [10, 20, 20, 20, 10],
        [10, 10, 20, 20, 20],
        [40, 40, 40, 10, 10],
        [10, 10, 40, 40, 40],
      ], { gas: 2000000 }),
      'setGeneTypesFactors'
    ),
    logger(
      dragonParams.setLevelUpPoints(
        [30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
        [0, 10, 13, 16, 21, 28, 37, 48, 62, 81, 106],
        10, { gas: 350000 },
      ),
      'setLevelUpPoints'
    ),
    logger(
      dragonParams.setGeneUpgradeDNAPoints([
        10, 10, 10, 11, 11, 11, 11, 11, 12, 12,
        12, 12, 13, 13, 13, 13, 14, 14, 14, 15,
        15, 15, 15, 16, 16, 16, 17, 17, 17, 18,
        18, 18, 19, 19, 20, 20, 20, 21, 21, 22,
        22, 23, 23, 23, 24, 24, 25, 25, 26, 26,
        27, 27, 28, 29, 29, 30, 30, 31, 32, 32,
        33, 33, 34, 35, 36, 36, 37, 38, 38, 39,
        40, 41, 42, 42, 43, 44, 45, 46, 47, 48,
        49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
        59, 61, 62, 63, 64, 66, 67, 68, 70,
      ], { gas: 850000 }),
      'setGeneUpgradeDNAPoints'
    ),
  ]);

  await Promise.all(contracts.map(async (contract, index, array) => {
    await logger(
      contract.transferOwnership(upgradeController.address, { gas: 100000 }),
      `transferOwnership (${index + 1}/${array.length})`
    );
  }));

  await logger(
    upgradeController.transferOwnership(NONSENSE_MULTISIG, { gas: 100000 }),
    'transferOwnership upgradeController'
  );
};
