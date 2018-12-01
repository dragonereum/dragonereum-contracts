const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const DragonGeneticsMock = artifacts.require("DragonGeneticsMock.sol");
const DragonUtilsMock = artifacts.require("DragonUtilsMock.sol");
const CoreMock = artifacts.require("CoreMock.sol");

const {takeSnapshot,revertSnapshot} = require('../scripts/ganacheHelper.js');



const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

contract('Dragon', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const team = accounts[2];

    before(async () => {
        ({
            dragonStorage, random, dragonGetter, dragonGenetics,
            nest, core, getter, mainBase, upgradeController,
        } = await deployer(owner, team));

        coreMock = await CoreMock.new({from: owner});
        await coreMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(core.address, coreMock.address, {from: owner});
        core = coreMock;

        dragonGeneticsMock = await DragonGeneticsMock.new({from: owner});

        await dragonGeneticsMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(dragonGenetics.address, dragonGeneticsMock.address, {from: owner});
        dragonGenetics = dragonGeneticsMock;

        dragonUtils = await DragonUtilsMock.new({from: owner});

        await upgradeController.returnOwnership(core.address);
        let coreExternalDependencies = await core.getExternalDependencies();
        coreExternalDependencies.push(controller);
        await core.setExternalDependencies(coreExternalDependencies, {from: owner}).should.be.fulfilled;
        await core.transferOwnership(upgradeController.address);

        await upgradeController.returnOwnership(nest.address);
        let nestExternalDependencies = await nest.getExternalDependencies();
        nestExternalDependencies.push(controller);
        await nest.setExternalDependencies(nestExternalDependencies, {from: owner}).should.be.fulfilled;
        await nest.transferOwnership(upgradeController.address);

        await upgradeController.returnOwnership(dragonStorage.address);
        let dragonStorageExternalDependencies = await dragonStorage.getExternalDependencies();
        dragonStorageExternalDependencies.push(controller);
        await dragonStorage.setExternalDependencies(dragonStorageExternalDependencies, {from: owner}).should.be.fulfilled;
        await dragonStorage.transferOwnership(upgradeController.address);

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result);
        snapshotId = await takeSnapshot();
      })

    describe('#createGenomeForGenesis', async () => {
        const senders = [accounts[5], accounts[6], accounts[7]];
        const race = [0,1,2,3,4]
        const NUMBER_OF_EGG = 3
        const NUMBER_OF_SENDERS = senders.length;
        sender = accounts[5];

        beforeEach("create eggs and send to nest", async () => {
            eggIds = []
            for (let i = 0; i < NUMBER_OF_EGG; i++) {
                await mainBase.claimEgg(race[i % 5], {from: senders[i % 3]});
                eggIds.push(i+1);
            }
            for (let i = 0; i < 2; i++) {
                await mainBase.sendToNest(eggIds[i], {from: senders[i % NUMBER_OF_SENDERS]});
            }
        })

        it('active gene for genesis genom generated correctly', async () => {
            let seed = (new BN(2)).pow(toBN(256)).sub(toBN(1));
            randomNumber = await random.random(seed);
            let _seed = randomNumber;
            let genome = [];
            let expectedActiveGenome = []
            for (let i = 0; i < 10; i++){
                result = await dragonGenetics.getSpecialRandom(_seed, 3);
                _random = result[0];
                _seed = result[1];
                genome[i] = await dragonGenetics.generateGen(2, _random)
                for (let j = 0; j < 3; j++){
                    expectedActiveGenome.push(genome[i][j]);
                }
            }
            await core._openEgg(senders[2], eggIds[2], randomNumber, {from:controller});
            let actualActiveGenome = await getter.getDragonGenome(1);
            actualActiveGenome.should.be.deep.equal(expectedActiveGenome);
        });

        it('coolness calculated correctly', async () => {
            let seed = (new BN(2)).pow(toBN(256)).sub(toBN(1));
            randomNumber = await random.random(seed);
            let _seed = randomNumber;
            let genome = [];
            let expectedActiveGenome = []
            for (let i = 0; i < 10; i++){
                result = await dragonGenetics.getSpecialRandom(_seed, 3);
                _random = result[0];
                _seed = result[1];
                genome[i] = await dragonGenetics.generateGen(2, _random)
                for (let j = 0; j < 3; j++){
                    expectedActiveGenome.push(genome[i][j]);
                }
            }
            await core._openEgg(senders[2], eggIds[2], randomNumber, {from:controller});
            let actualActiveGenome = await getter.getDragonGenome(1);
            actualActiveGenome.should.be.deep.equal(expectedActiveGenome);
            let expectedComposedGenome = await dragonUtils.composeGenome(genome);
            let actualComposedGenome = await dragonGetter.getComposedGenome(1);
            expectedComposedGenome.should.be.deep.equal(actualComposedGenome);
            let expectedCoolness = 0;
            geneVarietyFactors = [5, 12, 12, 12, 12, 16, 16, 16, 28, 28]
            for (let i = 0; i < 10; i++){
                for (let j = 0; j < 4; j++){
                    geneVariety = genome[i][j * 4 + 1];
                    geneLevel = genome[i][j * 4 + 2];
                    dominantOrRecessive = genome[i][j * 4 + 3];
                    geneVarietyFactor = geneVarietyFactors[geneVariety];
                    dominantOrRecessiveFactor = (dominantOrRecessive == 1) ? 10 : 7;
                    expectedCoolness = (new BN(expectedCoolness)).add((toBN(geneLevel)).mul(toBN(geneVarietyFactor)).mul(toBN(dominantOrRecessiveFactor)));
                }
            }
            let actualCoolness = await dragonGetter.getCoolness(1);
            actualCoolness.should.be.deep.eq.BN(expectedCoolness);
        });

        it('genome after composed decomposed has not changed', async () => {
            let seed = (new BN(2)).pow(toBN(256)).sub(toBN(1));
            randomNumber = await random.random(seed);
            let _seed = randomNumber;
            let genome = [];
            for (let i=0; i < 10; i++){
                result = await dragonGenetics.getSpecialRandom(_seed, 3);
                _random = result[0];
                _seed = result[1];
                genome[i] = await dragonGenetics.generateGen(0, _random);
            }
            let expectedComposedGenome = await dragonUtils.composeGenome(genome);
            let actualComposedGenome = await dragonGenetics.testComposed(expectedComposedGenome);
            actualComposedGenome.should.be.deep.equal(expectedComposedGenome);
        });
    })
    describe('#_checkInbreeding', async () => {
        it("correctly work for grandparents", async () => {
            let sender = accounts[6];
            let generation = 0;
            let genome = [0, 0, 0, 0];
            let parents = [0, 0];
            let types = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            let Dragon1 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            let Dragon2 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            let Dragon3 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            let Dragon4 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});

            parents = [1, 2]
            let Dragon5 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            let Dragon6 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            var chance = await dragonGenetics.checkInbreeding([5, 6]);
            chance.should.be.eq.BN(8);

            parents = [2, 3]
            let Dragon7 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            var chance = await dragonGenetics.checkInbreeding([5, 7]);
            chance.should.be.eq.BN(7);

            parents = [2, 5]
            let Dragon8 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            var chance = await dragonGenetics.checkInbreeding([5, 8]);
            chance.should.be.eq.BN(8);

            parents = [3, 5]
            let Dragon9 = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            var chance = await dragonGenetics.checkInbreeding([5, 9]);
            chance.should.be.eq.BN(8);
        })
    });
    describe('#_mutateGene', async () => {
        it("establishes a new type of genes", async () => {
            let gen = [2, 2, 3, 1, 3, 2, 3, 0, 1, 2, 3, 0, 1, 3, 4, 0];
            let expectedGen = [2, 7, 1, 1, 3, 2, 3, 0, 1, 2, 3, 0, 1, 3, 4, 0];
            let genType = 7;
            let newGen  = await dragonGenetics.mutateGene(gen, genType);
            newGen.should.be.deep.eq.BN(expectedGen);
        });
    });
    describe('#_calculateGen & #_chooseGen', async () => {
        it("calculateGen work correctly", async () => {
            let momgen = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
            let dadgen = [0, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 111, 121, 131, 141, 151];

            let random = 7;
            let expectedGen = [8, 9, 10, 11, 81, 91, 101, 111, 12, 13, 14, 15, 121, 131, 141, 151];
            let actualGen = await dragonGenetics.calculateGen(momgen, dadgen, random);
            actualGen.should.be.deep.eq.BN(expectedGen);

            random = 6;
            expectedGen = [8, 9, 10, 11, 0, 11, 21, 31, 12, 13, 14, 15, 41, 51, 61, 71];
            actualGen = await dragonGenetics.calculateGen(momgen, dadgen, random);
            actualGen.should.be.deep.eq.BN(expectedGen);

            random = 5;
            expectedGen = [0, 1, 2, 3, 81, 91, 101, 111, 4, 5, 6, 7, 121, 131, 141, 151];
            actualGen = await dragonGenetics.calculateGen(momgen, dadgen, random);
            actualGen.should.be.deep.eq.BN(expectedGen);

            random = 4;
            expectedGen = [0, 1, 2, 3, 0, 11, 21, 31, 4, 5, 6, 7, 41, 51, 61, 71];
            actualGen = await dragonGenetics.calculateGen(momgen, dadgen, random);
            actualGen.should.be.deep.eq.BN(expectedGen);
        })
    });
    //describe('#_calculateGenome');
    describe('#_calculateDragonTypes', async () => {
        it("calculate dragon types", async () => {
            let genome = [
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0],
                [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0]
            ];
            let expectedDragonTypes = [0, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0];
            let composed = await dragonUtils.composeGenome(genome);
            let actualDragonTypes =  await dragonGenetics.calculateDragonTypes(composed);
            actualDragonTypes.should.be.deep.eq.BN(expectedDragonTypes);
        });
    });
    //describe('#createGenome');
    describe('#_getWeightedRandom', async () => {
        it('genesis geneType generated correctly', async () => {
            //_geneType = 1
            //300 < _geneType <= 0
            (await dragonGenetics.getWeightedRandom(0)).should.be.eq.BN(1);
            (await dragonGenetics.getWeightedRandom(299)).should.be.eq.BN(1);
            //_geneType = 2
            //540 < _geneType <= 300
            (await dragonGenetics.getWeightedRandom(300)).should.be.eq.BN(2);
            (await dragonGenetics.getWeightedRandom(539)).should.be.eq.BN(2);
            //_geneType = 3
            //760 < _geneType <= 540
            (await dragonGenetics.getWeightedRandom(540)).should.be.eq.BN(3);
            (await dragonGenetics.getWeightedRandom(759)).should.be.eq.BN(3);
            //_geneType = 4
            //950 < _geneType <= 760
            (await dragonGenetics.getWeightedRandom(760)).should.be.eq.BN(4);
            (await dragonGenetics.getWeightedRandom(949)).should.be.eq.BN(4);
            //_geneType = 5
            //975 < _geneType <= 950
            (await dragonGenetics.getWeightedRandom(950)).should.be.eq.BN(5);
            (await dragonGenetics.getWeightedRandom(974)).should.be.eq.BN(5);
            //_geneType = 6
            //990 < _geneType <= 975
            (await dragonGenetics.getWeightedRandom(975)).should.be.eq.BN(6);
            (await dragonGenetics.getWeightedRandom(989)).should.be.eq.BN(6);
            //_geneType = 7
            //1000 < _geneType <= 990
            (await dragonGenetics.getWeightedRandom(990)).should.be.eq.BN(7);
            (await dragonGenetics.getWeightedRandom(999)).should.be.eq.BN(7);
        });
    });
    describe('#_generateGen', async () => {
        it('genesis genom generated correctly', async () => {
            const race = [0,1,2,3,4]
            // race randType 1 1
            // race randType 1 0
            // race randType 1 0
            // race randType 1 0
            let random = [0, 300, 540, 760, 950, 975, 990];
            for (let i = 0; i < race.length; i++) {
                for (let j = 0; j < 7; j++) {
                    gen = await dragonGenetics.generateGen(race[i], random[j]);
                    for (let k = 0; k < 16; k++) {
                        if (k % 4 == 0) gen[k].should.be.eq.BN(race[i]);
                        else if ((k + 1) % 4 == 1) gen[k].should.be.eq.BN(j+1);
                        else if ((k + 2) % 4 == 2 || k == 3) gen[k].should.be.eq.BN(1);
                        else if ((k + 3) % 4 == 3 && k != 3) gen[k].should.be.eq.BN(j+1);
                    }
                }
            }
        });
    });
    describe('#_getSpecialRandom', async () => {
        it('special random gives numbers less than 1000 for 3', async () => {
            _seed = 0x3e8 // 1000
            result = await dragonGenetics.getSpecialRandom(_seed, 3);
            result[0].should.be.eq.BN(0); // 1000 % 1000 = 0
            result[1].should.be.eq.BN(1); // 1000 / 1000 = 1
            _seed = 0x3e7 // 999
            result = await dragonGenetics.getSpecialRandom(_seed, 3);
            result[0].should.be.eq.BN(999); // 999 % 1000 = 999
            result[1].should.be.eq.BN(0); // 999 / 1000 = 0
        });
        it('special random gives numbers less than 10000 for 4', async () => {
            _seed = 0x2710 // 10000
            result = await dragonGenetics.getSpecialRandom(_seed, 4);
            result[0].should.be.eq.BN(0); // 10000 % 10000 = 0
            result[1].should.be.eq.BN(1); // 10000 / 10000 = 1
            _seed = 0x270f // 9999
            result = await dragonGenetics.getSpecialRandom(_seed, 4);
            result[0].should.be.eq.BN(9999); // 9999 % 10000 = 9999
            result[1].should.be.eq.BN(0); // 9999 / 10000 = 0
        })
    });
})
