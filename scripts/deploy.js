const resolveDependencies = require('../migrations/helpers/resolve_contracts_dependencies');

const UpgradeController = artifacts.require('./UpgradeController.sol');

const User = artifacts.require('./User.sol');
const MainBase = artifacts.require('./MainBase.sol');
const MainBattle = artifacts.require('./MainBattle.sol');
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
const MainMarket = artifacts.require('./MainMarket.sol');



const DRAGON_TOKEN_NAME = 'Dragonereum';
const DRAGON_TOKEN_SYMBOL = 'DRAGON';
const EGG_TOKEN_NAME = 'Dragonereum Egg';
const EGG_TOKEN_SYMBOL = 'DEGG';
const GOLD_TOKEN_NAME = 'Dragonereum Gold';
const GOLD_TOKEN_SYMBOL = 'DGOLD';
const GOLD_AMOUNT = 60000000;
const GOLD_DECIMALS = 18;


async function deploy(owner, teamAccount) {
    const dragonStorageParams = [DRAGON_TOKEN_NAME, DRAGON_TOKEN_SYMBOL];
    const eggStorageParams = [EGG_TOKEN_NAME, EGG_TOKEN_SYMBOL];


    const contracts = await Promise.all([
        Treasury.new({from: owner}),
        EggStorage.new(...eggStorageParams, {from: owner}),
        DragonStorage.new(...dragonStorageParams, {from: owner}),
        DragonParams.new({from: owner}),
        User.new({from: owner}),
        Random.new({from: owner}),
        DragonCore.new({from: owner}),
        DragonLeaderboard.new({from: owner}),
        DragonGetter.new({from: owner}),
        DragonGenetics.new({from: owner}),
        DragonCoreHelper.new({from: owner}),
        EggCore.new({from: owner}),
        Nest.new({from: owner}),
        Core.new({from: owner}),
        DragonMarketplace.new({from: owner}),
        BreedingMarketplace.new({from: owner}),
        EggMarketplace.new({from: owner}),
        GoldMarketplace.new({from: owner}),
        GoldMarketplaceStorage.new({from: owner}),
        SkillMarketplace.new({from: owner}),
        Distribution.new({from: owner}),
        Battle.new({from: owner}),
        Getter.new({from: owner}),
        MarketplaceController.new({from: owner}),
        CoreController.new({from: owner}),
        BattleController.new({from: owner}),
        GladiatorBattle.new({from: owner}),
        GladiatorBattleStorage.new({from: owner}),
        GladiatorBattleSpectators.new({from: owner}),
        GladiatorBattleSpectatorsStorage.new({from: owner}),
        MainBase.new({from: owner}),
        MainBattle.new({from: owner}),
        Events.new({from: owner}),
        MainMarket.new({from: owner}),
    ]);

    const [
        treasury, eggStorage, dragonStorage, dragonParams,
      ] = contracts;

    gold = await Gold.new(treasury.address, {from: owner});
    contracts.push(gold);
    const upgradeController = await UpgradeController.new({from: owner});

    await resolveDependencies(contracts, artifacts);

    await Promise.all([
        eggStorage.setUrl('https://app.dragonereum.io/eggs/'),
        dragonStorage.setUrl('https://app.dragonereum.io/dragons/'),
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
        ]),
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
        ]),
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
        ]),
        dragonParams.setLevelUpPoints(
          [30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
          [0, 10, 13, 16, 21, 28, 37, 48, 62, 81, 106],
          10,
        ),
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
        ]),
      ]);


    await Promise.all(contracts.map(async (contract) => {
       await contract.transferOwnership(upgradeController.address);
    }));
    contracts.push(upgradeController);

    const keys = [
        'treasury', 'eggStorage', 'dragonStorage', 'dragonParams',
        'user', 'random', 'dragonCore', 'dragonLeaderboard', 'dragonGetter',
        'dragonGenetics', 'dragonCoreHelper', 'eggCore', 'nest', 'core',
        'dragonMarketplace', 'breedingMarketplace', 'eggMarketplace',
        'goldMarketplace', 'goldMarketplaceStorage', 'skillMarketplace', 'distribution', 'battle',
        'getter', 'marketplaceController', 'coreController', 'battleController',
        'gladiatorBattle', 'gladiatorBattleStorage', 'gladiatorBattleSpectators',
        'gladiatorBattleSpectatorsStorage', 'mainBase', 'mainBattle',
        'events', 'mainMarket', 'gold', 'upgradeController',
    ];

    const mapping = {};
    contracts.forEach((contract, index) => {
        mapping[keys[index]] = contract;
    });

    return mapping;
}

module.exports = deploy;
