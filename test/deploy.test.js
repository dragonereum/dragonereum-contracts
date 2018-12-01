require('chai')
    .use(require('bn-chai')(web3.utils.BN))
    .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;


contract('Tests for deploying', async (accounts) => {

    before('deploy contracts and set dependencies', async () => {
        const owner = accounts[0];
        const teamAddress = accounts[1];
        ({
            treasury, eggStorage, dragonStorage, dragonParams, user,
            random, dragonCore, dragonLeaderboard, dragonGetter, dragonGenetics,
            dragonCoreHelper, eggCore, nest, core, dragonMarketplace,
            breedingMarketplace, eggMarketplace, goldMarketplace, goldMarketplaceStorage, skillMarketplace,
            distribution, battle, getter, marketplaceController, coreController,
            battleController, gladiatorBattle, gladiatorBattleStorage,
            gladiatorBattleSpectators, gladiatorBattleSpectatorsStorage,
            mainBase, mainBattle, events, mainMarket, gold,
        } = await deployer(owner, teamAddress));

        addressesOfContracts = new Map();
        addressesOfContracts.set(treasury.address, "treasury");
        addressesOfContracts.set(eggStorage.address, "eggStorage");
        addressesOfContracts.set(dragonStorage.address, "dragonStorage");
        addressesOfContracts.set(dragonParams.address, "dragonParams");
        addressesOfContracts.set(user.address, "user");
        addressesOfContracts.set(random.address, "random");
        addressesOfContracts.set(dragonCore.address, "dragonCore");
        addressesOfContracts.set(dragonLeaderboard.address, "dragonLeaderboard");
        addressesOfContracts.set(dragonGetter.address, "dragonGetter");
        addressesOfContracts.set(dragonGenetics.address, "dragonGenetics");
        addressesOfContracts.set(dragonCoreHelper.address, "dragonCoreHelper");
        addressesOfContracts.set(eggCore.address, "eggCore");
        addressesOfContracts.set(nest.address, "nest");
        addressesOfContracts.set(core.address, "core");
        addressesOfContracts.set(dragonMarketplace.address, "dragonMarketplace");
        addressesOfContracts.set(breedingMarketplace.address, "breedingMarketplace");
        addressesOfContracts.set(eggMarketplace.address, "eggMarketplace");
        addressesOfContracts.set(goldMarketplace.address, "goldMarketplace");
        addressesOfContracts.set(goldMarketplaceStorage.address, "goldMarketplaceStorage");
        addressesOfContracts.set(skillMarketplace.address, "skillMarketplace");
        addressesOfContracts.set(distribution.address, "distribution");
        addressesOfContracts.set(battle.address, "battle");
        addressesOfContracts.set(getter.address, "getter");
        addressesOfContracts.set(marketplaceController.address, "marketplaceController");
        addressesOfContracts.set(coreController.address, "coreController");
        addressesOfContracts.set(battleController.address, "battleController");
        addressesOfContracts.set(gladiatorBattle.address, "gladiatorBattle");
        addressesOfContracts.set(gladiatorBattleStorage.address, "gladiatorBattleStorage");
        addressesOfContracts.set(gladiatorBattleSpectators.address, "gladiatorBattleSpectators");
        addressesOfContracts.set(gladiatorBattleSpectatorsStorage.address, "gladiatorBattleSpectatorsStorage");
        addressesOfContracts.set(mainBase.address, "mainBase");
        addressesOfContracts.set(mainBattle.address, "mainBattle");
        addressesOfContracts.set(events.address, "events");
        addressesOfContracts.set(gold.address, "gold");
        addressesOfContracts.set(mainMarket.address, "mainMarket");

    })

    describe('#MainBase', async () => {
        /*
        MainBase.sol:
            -> CoreController
            -> User
            -> Events
        */
            it("internal dependencies mounted correctly", async () => {
                let [_coreController, _user, _events] = await mainBase.getInternalDependencies();
                    _coreController.should.be.equal(coreController.address);
                    _user.should.be.equal(user.address);
                    _events.should.be.equal(events.address);
            });
            it("does not have external dependencies", async () => {
                ((await mainBase.getExternalDependencies()).length).should.be.equal(0);
            });
        });

    describe('#Treasury', async () => {
        /*
        Treasury.sol:
            -> Gold
        */
        it("internal dependencies mounted correctly", async () => {
            let [_gold,] = await treasury.getInternalDependencies();
            _gold.should.be.equal(gold.address);
        });

        /*
        Treasury.sol:
            GladiatorBattle ->
            CoreController  ->
            BattleController ->
            Getter ->
            MarketplaceController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["gladiatorBattle", "coreController", "battleController", "getter"];
            let actualDependencies = []
            let dependencies = await treasury.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#EggStorage', async () => {
        /*
        EggStorage.sol:
            -> None
        */
        it("does not have internal dependencies", async () => {
            ((await eggStorage.getInternalDependencies()).length).should.be.equal(0);
        });

        /*
        EggStorage.sol:
            EggCore ->
            MarketplaceController ->

        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["eggCore", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await eggStorage.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                //console.log(expectedDependencies[i]);
                //console.log(actualDependencies[i]);
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonStorage', async () => {
        /*
        DragonStorage.sol:
            -> None
        */
        it("does not have internal dependencies", async () => {
            ((await dragonStorage.getInternalDependencies()).length).should.be.equal(0);
        });

        /*
        DragonStorage.sol:
            DragonCore is DragonBase ->
            DragonGetter ->
            MarketplaceController ->

        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["dragonCore", "dragonGetter", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await dragonStorage.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonParams', async () => {
        /*
        DragonParams.sol:
            -> None
        */
        it("does not have internal dependencies", async () => {
            ((await dragonParams.getInternalDependencies()).length).should.be.equal(0);
        });

        /*
        DragonParams.sol:
            DragonCore is DragonBase ->
            DragonCoreHelper ->
            Getter ->

        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["dragonCore", "dragonCoreHelper", "getter"];
            let actualDependencies = []
            let dependencies = await dragonParams.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });

        it("dragon types factors set", async () => {
            const dragonTypes = await dragonParams.getDragonTypesFactors();

            //uint8[5][11] _dragonTypesFactors_;
            let summ = toBN('0');
            for(j = 0; j < 5; j++) {
                summ = summ.add(dragonTypes[j]);
            }

            for( i = 1; i < 5; i++) {
                let sum = toBN('0');
                for(j = 0; j < 5; j++) {
                    sum = sum.add(dragonTypes[j]);
                }
                sum.should.be.eq.BN(summ);
            }
        })
    });

    describe('#User', async () => {
        /*
        User.sol:
            -> None
        */
        it("does not have internal dependencies", async () => {
            ((await user.getInternalDependencies()).length).should.be.equal(0);
        });

        /*
        User.sol:
            MainBase ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["mainBase"];
            let actualDependencies = []
            let dependencies = await user.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#Random', async () => {
        /*
        Random.sol:
            -> None
        */
        it("does not have internal dependencies", async () => {
            ((await random.getInternalDependencies()).length).should.be.equal(0);
        });

        /*
        Random.sol:
            GladiatorBattle ->
            DragonCore ->
            BattleController ->
            Nest ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["gladiatorBattle", "dragonCore", "battleController", "nest"];
            let actualDependencies = []
            let dependencies = await random.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonCore', async () => {
        /*
        DragonCore.sol:
            -> DragonStorage
            -> DragonParams
            -> DragonCoreHelper
            -> Random
        */
       it("internal dependencies mounted correctly", async () => {
        let [_dragonStorage, _dragonParams, _dragonCoreHelper, _random] = await dragonCore.getInternalDependencies();
            _dragonStorage.should.be.equal(dragonStorage.address);
            _dragonParams.should.be.equal(dragonParams.address);
            _dragonCoreHelper.should.be.equal(dragonCoreHelper.address);
            _random.should.be.equal(random.address);
        });

        /*
        DragonCore.sol:
            Core ->
            DragonGetter ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["core", "dragonGetter"];
            let actualDependencies = []
            let dependencies = await dragonCore.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonLeaderboard', async () => {
        /*
        DragonLeaderboard.sol:
            -> None
        */
       it("does not have internal dependencies", async () => {
        ((await dragonLeaderboard.getInternalDependencies()).length).should.be.equal(0);
        });

        /*
        DragonLeaderboard.sol:
            Core ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["core"];
            let actualDependencies = []
            let dependencies = await dragonLeaderboard.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonGetter', async () => {
        /*
        dragonGetter.sol:
            -> DragonStorage
            -> DragonCore
            -> DragonCoreHelper
        */
       it("internal dependencies mounted correctly", async () => {
        let [_dragonStorage, _dragonCore, _dragonCoreHelper] = await dragonGetter.getInternalDependencies();
            _dragonStorage.should.be.equal(dragonStorage.address);
            _dragonCore.should.be.equal(dragonCore.address);
            _dragonCoreHelper.should.be.equal(dragonCoreHelper.address);
        });

        /*
        dragonGetter.sol:
            Core ->
            Getter ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["core", "getter"];
            let actualDependencies = []
            let dependencies = await dragonGetter.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonGenetics', async () => {
        /*
        DragonGenetics.sol:
            -> Getter
        */
       it("internal dependencies mounted correctly", async () => {
        let [_getter] = await dragonGenetics.getInternalDependencies();
            _getter.should.be.equal(getter.address);
        });

        /*
        dragonGenetics.sol:
            Core ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["core"];
            let actualDependencies = []
            let dependencies = await dragonGenetics.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonCoreHelper', async () => {
        /*
        DragonCoreHelper.sol:
            -> DragonParams
        */
       it("internal dependencies mounted correctly", async () => {
        let [_dragonParams] = await dragonCoreHelper.getInternalDependencies();
        _dragonParams.should.be.equal(dragonParams.address);
        });

        /*
        DragonCoreHelper.sol:
            DragonCore ->
            DragonGetter ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["dragonCore", "dragonGetter"];
            let actualDependencies = []
            let dependencies = await dragonCoreHelper.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#EggCore', async () => {
        /*
        EggCore.sol:
            -> EggStorage
        */
       it("internal dependencies mounted correctly", async () => {
        let [_eggStorage] = await eggCore.getInternalDependencies();
        _eggStorage.should.be.equal(eggStorage.address);
        });

        /*
        EggCore.sol:
            Core ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["core"];
            let actualDependencies = []
            let dependencies = await eggCore.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#Nest', async () => {
        /*
        Nest.sol:
            -> Random
        */
       it("internal dependencies mounted correctly", async () => {
        let [_random] = await nest.getInternalDependencies();
        _random.should.be.equal(random.address);
        });

        /*
        Nest.sol:
            Core ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["core"];
            let actualDependencies = []
            let dependencies = await nest.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#Core', async () => {
        /*
        Core.sol:
            -> DragonCore
            -> DragonGetter
            -> DragonGenetics
            -> EggCore
            -> DragonLeaderboard
            -> Nest
        */
       it("internal dependencies mounted correctly", async () => {
        let [_dragonCore, _dragonGetter, _dragonGenetics, _eggCore, _leaderboard, _nest] = await core.getInternalDependencies();
        _dragonCore.should.be.equal(dragonCore.address);
        _dragonGetter.should.be.equal(dragonGetter.address);
        _dragonGenetics.should.be.equal(dragonGenetics.address);
        _eggCore.should.be.equal(eggCore.address);
        _leaderboard.should.be.equal(dragonLeaderboard.address);
        _nest.should.be.equal(nest.address);
        });

        /*
        Core.sol:
            CoreController ->
            BattleController ->
            Getter ->
            MarketplaceController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["coreController" , "battleController", "getter", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await core.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#DragonMarketplace', async () => {
        /*
        DragonMarketplace.sol:
            -> None
        */
       it("does not have internal dependencies", async () => {
            ((await dragonMarketplace.getInternalDependencies()).length).should.be.equal(0);
        });
        /*
        DragonMarketplace.sol:
            Getter ->
            MarketplaceController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["getter", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await dragonMarketplace.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#BreedingMarketplace', async () => {
        /*
        BreedingMarketplace.sol:
            -> None
        */
       it("does not have internal dependencies", async () => {
            ((await breedingMarketplace.getInternalDependencies()).length).should.be.equal(0);
        });
        /*
        BreedingMarketplace.sol:
            Getter ->
            MarketplaceController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["getter", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await breedingMarketplace.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#EggMarketplace', async () => {
        /*
        EggMarketplace.sol:
            -> None
        */
       it("does not have internal dependencies", async () => {
            ((await eggMarketplace.getInternalDependencies()).length).should.be.equal(0);
        });
        /*
        EggMarketplace.sol:
            Getter ->
            MarketplaceController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["getter", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await eggMarketplace.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#GoldMarketplace', async () => {
        /*
        GoldMarketplace.sol:
            -> GoldMarketplaceStorage
            -> Gold
        */
        it("internal dependencies mounted correctly", async () => {
          let [_goldMarketplaceStorage, _gold] = await goldMarketplace.getInternalDependencies();
          _goldMarketplaceStorage.should.be.equal(goldMarketplaceStorage.address);
          _gold.should.be.equal(gold.address);
        });
        /*
        GoldMarketplace.sol:
            MarketplaceController ->
            MainMarket ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["marketplaceController", "mainMarket"];
            let actualDependencies = []
            let dependencies = await goldMarketplace.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#GoldMarketplaceStorage', async () => {
      /*
      GoldMarketplaceStorage.sol:
          -> None
      */
     it("internal dependencies mounted correctly", async () => {
          let [_gold] = await goldMarketplaceStorage.getInternalDependencies();
          _gold.should.be.equal(gold.address);
      });
      /*
      GoldMarketplaceStorage.sol:
          GoldMarketplace ->
      */
      it("external dependencies mounted correctly", async () => {
          let expectedDependencies = ["goldMarketplace"];
          let actualDependencies = []
          let dependencies = await goldMarketplaceStorage.getExternalDependencies();
          for (let address of dependencies) {
              actualDependencies.push(addressesOfContracts.get(address));
          }
          expectedDependencies.sort();
          actualDependencies.sort();

          for (var i = 0; i < expectedDependencies.length;i++) {
              expectedDependencies[i].should.be.equal(actualDependencies[i]);
          }
      });
  });

    describe('#SkillMarketplace', async () => {
        /*
        SkillMarketplace.sol:
            -> None
        */
       it("does not have internal dependencies", async () => {
            ((await skillMarketplace.getInternalDependencies()).length).should.be.equal(0);
        });
        /*
        SkillMarketplace.sol:
            Getter ->
            MarketplaceController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["getter", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await skillMarketplace.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#Distribution', async () => {
        /*
        Distribution.sol:
            -> None
        */
       it("does not have internal dependencies", async () => {
            ((await distribution.getInternalDependencies()).length).should.be.equal(0);
        });
        /*
        Distribution.sol:
            CoreController ->
            Getter ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["coreController", "getter"];
            let actualDependencies = []
            let dependencies = await distribution.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#Battle', async () => {
        /*
        Battle.sol:
            -> Getter
        */
        it("internal dependencies mounted correctly", async () => {
            let [_getter] = await battle.getInternalDependencies();
            _getter.should.be.equal(getter.address);
        });
        /*
        Battle.sol:
            GladiatorBattle ->
            BattleController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["gladiatorBattle", "battleController"];
            let actualDependencies = []
            let dependencies = await battle.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#Getter', async () => {
        /*
        Getter.sol:
            -> Core
            -> DragonParams
            -> DragonGetter
            -> SkillMarketplace
            -> Distribution
            -> Treasury
            -> GladiatorBattle
            -> GladiatorBattleStorage
            -> BreedingMarketplace
            -> EggMarketplace
            -> DragonMarketplace
        */
        it("internal dependencies mounted correctly", async () => {
            let [_core, _dragonParams, _dragonGetter,
                _dragonMarketplace, _breedingMarketplace,
                _eggMarketplace, _skillMarketplace,
                _distribution, _treasury, _gladiatorBattle, _gladiatorBattleStorage] = await getter.getInternalDependencies();

            _core.should.be.equal(core.address);
            _dragonParams.should.be.equal(dragonParams.address);
            _dragonGetter.should.be.equal(dragonGetter.address);
            _dragonMarketplace.should.be.equal(dragonMarketplace.address);
            _breedingMarketplace.should.be.equal(breedingMarketplace.address);
            _eggMarketplace.should.be.equal(eggMarketplace.address);
            _skillMarketplace.should.be.equal(skillMarketplace.address);
            _distribution.should.be.equal(distribution.address);
            _treasury.should.be.equal(treasury.address);
            _gladiatorBattle.should.be.equal(gladiatorBattle.address);
            _gladiatorBattleStorage.should.be.equal(gladiatorBattleStorage.address);
        });
        /*
        Getter.sol:
            GladiatorBattle ->
            CoreController ->
            DragonGenetics ->
            Battle ->
            BattleController ->
            MainBattle ->
            MarketplaceController ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["gladiatorBattle", "coreController", "dragonGenetics", "battle", "battleController", "mainBattle", "marketplaceController"];
            let actualDependencies = []
            let dependencies = await getter.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#MarketplaceController', async () => {
        /*
        MarketplaceController.sol:
            -> Core
            -> DragonStorage
            -> EggStorage
            -> Treasury
            -> DragonMarketplace
            -> BreedingMarketplace
            -> EggMarketplace
            -> GoldMarketplace
            -> SkillMarketplace
            -> Gold
            -> Getter
        */
        it("internal dependencies mounted correctly", async () => {
            let [_core, _dragonStorage, _eggStorage,
                _dragonMarketplace, _breedingMarketplace,
                _eggMarketplace, _goldMarketplace, _skillMarketplace,
                _gold, _getter] = await marketplaceController.getInternalDependencies();

            _core.should.be.equal(core.address);
            _dragonStorage.should.be.equal(dragonStorage.address);
            _eggStorage.should.be.equal(eggStorage.address);
            _dragonMarketplace.should.be.equal(dragonMarketplace.address);
            _breedingMarketplace.should.be.equal(breedingMarketplace.address);
            _eggMarketplace.should.be.equal(eggMarketplace.address);
            _goldMarketplace.should.be.equal(goldMarketplace.address);
            _skillMarketplace.should.be.equal(skillMarketplace.address);
            _gold.should.be.equal(gold.address);
            _getter.should.be.equal(getter.address);
        });
        /*
        MarketplaceController.sol:
            MainMarket ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["mainMarket"];
            let actualDependencies = []
            let dependencies = await marketplaceController.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#CoreController', async () => {
        /*
        CoreController.sol:
            -> Core
            -> Treasury
            -> Getter
            -> Distribution
        */
        it("internal dependencies mounted correctly", async () => {
            let [_core, _treasury, _getter, _distribution ] = await coreController.getInternalDependencies();

            _core.should.be.equal(core.address);
            _treasury.should.be.equal(treasury.address);
            _getter.should.be.equal(getter.address);
            _distribution.should.be.equal(distribution.address);

        });
        /*
        CoreController.sol:
            MainBase ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["mainBase"];
            let actualDependencies = []
            let dependencies = await coreController.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#BattleController', async () => {
        /*
        BattleController.sol:
            -> Core
            -> Battle
            -> Treasury
            -> Getter
            -> Random
        */
        it("internal dependencies mounted correctly", async () => {
            let [_core, _battle, _treasury, _getter, _random ] = await battleController.getInternalDependencies();

            _core.should.be.equal(core.address);
            _battle.should.be.equal(battle.address);
            _treasury.should.be.equal(treasury.address);
            _getter.should.be.equal(getter.address);
            _random.should.be.equal(random.address);

        });
        /*
        BattleController.sol:
            MainBattle ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["mainBattle"];
            let actualDependencies = []
            let dependencies = await battleController.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#GladiatorBattle', async () => {
        /*
        GladiatorBattle.sol:
            -> Battle
            -> Random
            -> Gold
            -> Getter
            -> Treasury
            -> GladiatorBattleStorage
        */
        it("internal dependencies mounted correctly", async () => {
            let [
                _battle, _random, _gold, _getter,
                _treasury, _gladiatorBattleStorage,
                _gladiatorBattleSpectatorsStorage,
            ] = await gladiatorBattle.getInternalDependencies();

            _battle.should.be.equal(battle.address);
            _random.should.be.equal(random.address);
            _gold.should.be.equal(gold.address);
            _getter.should.be.equal(getter.address);
            _treasury.should.be.equal(treasury.address);
            _gladiatorBattleStorage.should.be.equal(gladiatorBattleStorage.address);

        });
        /*
        GladiatorBattle.sol:
            Getter ->
            MainBattle ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["getter", "mainBattle"];
            let actualDependencies = []
            let dependencies = await gladiatorBattle.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#GladiatorBattleStorage', async () => {
      /*
      GladiatorBattleStorage.sol:
          -> Gold
      */
      it("internal dependencies mounted correctly", async () => {
          let [_gold] = await gladiatorBattleStorage.getInternalDependencies();
          _gold.should.be.equal(gold.address);

      });
      /*
      GladiatorBattleStorage.sol:
          Getter ->
          GladiatorBattle ->
      */
      it("external dependencies mounted correctly", async () => {
          let expectedDependencies = ["getter", "gladiatorBattle", "gladiatorBattleSpectators"];
          let actualDependencies = []
          let dependencies = await gladiatorBattleStorage.getExternalDependencies();
          for (let address of dependencies) {
              actualDependencies.push(addressesOfContracts.get(address));
          }
          expectedDependencies.sort();
          actualDependencies.sort();

          for (var i = 0; i < expectedDependencies.length;i++) {
              expectedDependencies[i].should.be.equal(actualDependencies[i]);
          }
      });
  });

    describe('#GladiatorBattleSpectators', async () => {
        /*
        GladiatorBattleSpectators.sol:
            -> Gold
            -> GladiatorBattleSpectatorsStorage
            -> GladiatorBattleStorage
        */
        it("internal dependencies mounted correctly", async () => {
            let [
                _gold,
                _gladiatorBattleSpectatorsStorage,
                _gladiatorBattleStorage,
            ] = await gladiatorBattleSpectators.getInternalDependencies();
            _gold.should.be.equal(gold.address);
            _gladiatorBattleSpectatorsStorage.should.be.equal(gladiatorBattleSpectatorsStorage.address);
            _gladiatorBattleStorage.should.be.equal(gladiatorBattleStorage.address);

        });
        /*
        GladiatorBattleSpectators.sol:
            MainBattle ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["mainBattle"];
            let actualDependencies = [];
            let dependencies = await gladiatorBattleSpectators.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#GladiatorBattleSpectatorsStorage', async () => {
        /*
        GladiatorBattleSpectatorsStorage.sol:
            -> Gold
        */
        it("internal dependencies mounted correctly", async () => {
            let [_gold] = await gladiatorBattleSpectatorsStorage.getInternalDependencies();
            _gold.should.be.equal(gold.address);

        });
        /*
        GladiatorBattleSpectatorsStorage.sol:
            GladiatorBattleSpectators ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["gladiatorBattleSpectators", "gladiatorBattle"];
            let actualDependencies = [];
            let dependencies = await gladiatorBattleSpectatorsStorage.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#MainBattle', async () => {
        /*
        MainBattle.sol:
            -> BattleController
            -> GladiatorBattle
            -> Getter
            -> Events
        */
        it("internal dependencies mounted correctly", async () => {
            let [
                _battleController,
                _gladiatorBattle,
                _gladiatorBattleSpectators,
                _getter,
                _events,
            ] = await mainBattle.getInternalDependencies();

            _battleController.should.be.equal(battleController.address);
            _gladiatorBattle.should.be.equal(gladiatorBattle.address);
            _gladiatorBattleSpectators.should.be.equal(gladiatorBattleSpectators.address);
            _getter.should.be.equal(getter.address);
            _events.should.be.equal(events.address);

        });
        /*
        MainBattle.sol:
            None ->
        */
        it("does not have external dependencies", async () => {
            ((await mainBattle.getExternalDependencies()).length).should.be.equal(0);
        });
    });

    describe('#Events', async () => {
        /*
        Events.sol:
            -> None
        */
        it("does not have internal dependencies", async () => {
            ((await events.getInternalDependencies()).length).should.be.equal(0);
        });
        /*
        Events.sol:
            MainBase ->
            MainBattle ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = ["mainBase", "mainBattle"];
            let actualDependencies = []
            let dependencies = await events.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#Gold', async () => {
        /*
        Gold.sol:
            -> None
        */
        it("does not have internal dependencies", async () => {
            ((await gold.getInternalDependencies()).length).should.be.equal(0);
        });
        /*
        Gold.sol:
            GladiatorBattle ->
            GladiatorBattleStorage ->
            MarketplaceController ->
            Treasury ->
            GoldMarketplace ->
        */
        it("external dependencies mounted correctly", async () => {
            let expectedDependencies = [
                "gladiatorBattle",
                "gladiatorBattleStorage",
                "gladiatorBattleSpectators",
                "gladiatorBattleSpectatorsStorage",
                "marketplaceController",
                "treasury",
                "goldMarketplace",
                "goldMarketplaceStorage",
            ];
            let actualDependencies = []
            let dependencies = await gold.getExternalDependencies();
            for (let address of dependencies) {
                actualDependencies.push(addressesOfContracts.get(address));
            }
            expectedDependencies.sort();
            actualDependencies.sort();

            for (var i = 0; i < expectedDependencies.length;i++) {
                expectedDependencies[i].should.be.equal(actualDependencies[i]);
            }
        });
    });

    describe('#MainMarket', async () => {
        /*
        MainMarket.sol:
            -> Events
            -> MarketplaceController
            -> GoldMarketplace
        */
        it("internal dependencies mounted correctly", async () => {
            let [
                _marketplaceController,
                _goldMarketplace,
                _events
            ] = await mainMarket.getInternalDependencies();

            _events.should.be.equal(events.address);
            _marketplaceController.should.be.equal(marketplaceController.address);
            _goldMarketplace.should.be.equal(goldMarketplace.address);

        });
        /*
        MainMarket.sol:
            None ->
        */
        it("does not have external dependencies", async () => {
            ((await mainMarket.getExternalDependencies()).length).should.be.equal(0);
        });
    });



    describe('#Params', async () => {
        it("set eggStorage url", async () => {
            (await eggStorage.url()).should.be.equal('https://app.dragonereum.io/eggs/');
        });
    });
})
