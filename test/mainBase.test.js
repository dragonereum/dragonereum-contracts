require('chai')
    .use(require('bn-chai')(web3.utils.BN))
    .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const EggStorage = artifacts.require('./Egg/EggStorage.sol');
const BattleMock = artifacts.require("BattleMock.sol");
const RandomMock = artifacts.require("RandomMock.sol");

const {takeSnapshot,revertSnapshot, mineBlock, minerStart, minerStop} = require('../scripts/ganacheHelper.js');

const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

contract('MainBaseTests', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const teamAccount = accounts[2];
    const userAccount = accounts[5];
    let snapshotId;

    before(async () => {
        ({
            treasury, eggStorage, dragonStorage, dragonParams,
            dragonGetter, distribution, battle, getter, mainBase,
            mainBattle, events, mainMarket, gold, upgradeController, dragonCoreHelper, dragonCore,
            gladiatorBattleStorage, dragonLeaderboard, eggCore,
        } = await deployer(owner, teamAccount));

        await upgradeController.returnOwnership(dragonStorage.address);
        let dragonStorageExternalDependencies = await dragonStorage.getExternalDependencies();
        dragonStorageExternalDependencies.push(controller);
        await dragonStorage.setExternalDependencies(dragonStorageExternalDependencies, {from: owner}).should.be.fulfilled;
        await dragonStorage.transferOwnership(upgradeController.address);

        // const randomMock = await RandomMock.new({from: owner});
        // await randomMock.transferOwnership(upgradeController.address);
        // await upgradeController.migrate(random.address, randomMock.address, {from: owner});
        // random = randomMock

        const battleMock = await BattleMock.new({from: owner});
        await battleMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(battle.address, battleMock.address, {from: owner});

        await upgradeController.returnOwnership(battleMock.address, {from: owner});
        let exts = await battleMock.getExternalDependencies();
        exts.push(controller);
        await battleMock.setExternalDependencies(exts, {from: owner});
        await battleMock.transferOwnership(upgradeController.address, {from: owner});
        battle = battleMock;

        await upgradeController.returnOwnership(treasury.address);
        let treasuryExternalDependencies = await treasury.getExternalDependencies();
        treasuryExternalDependencies.push(controller);
        await treasury.setExternalDependencies(treasuryExternalDependencies, {from: owner}).should.be.fulfilled;
        await treasury.transferOwnership(upgradeController.address);

        // adding new mocked distribution
        // distributionNew = await Distribution.new({from: owner});
        // await distributionNew.transferOwnership(upgradeController.address);
        // await upgradeController.migrate(distribution.address, distributionNew.address, {from: owner});
        // distribution = distributionNew;
        snapshotId = await takeSnapshot();
    })
    afterEach(async () => {
        await revertSnapshot(snapshotId.result);
        snapshotId = await takeSnapshot();
    })

    describe('#UserName', async () => {
        it("setName", async () => {
            let name = "test name";
            await mainBase.setName(name, {from: userAccount});
            const getName = await mainBase.getName(userAccount);
            const hexName = web3.utils.asciiToHex(name);
            expect(getName.slice(0,20)).equal(hexName);
        });

        it("invalid names", async () => {
            await mainBase.setName("123", {from: userAccount}).should.be.rejected;
            await mainBase.setName("N", {from: userAccount}).should.be.rejected;
            await mainBase.setName(" Test", {from: userAccount}).should.be.rejected;
            await mainBase.setName("Test ", {from: userAccount}).should.be.rejected;
            await mainBase.setName("Testtesttesttesttesttesttesttesttest", {from: userAccount}).should.be.rejected;
            await mainBase.setName("*test*", {from: userAccount}).should.be.rejected;
        });
    })

    describe('#claimEgg', async () => {
        it("should be claimed", async () => {
            const eggsBefore = await eggStorage.tokensOfOwner(userAccount);
            await mainBase.claimEgg(0, {from: userAccount});
            const eggsAfter = await eggStorage.tokensOfOwner(userAccount);

            eggsBefore.length.should.be.equal(eggsAfter.length - 1);

            const logs = await events.getPastEvents({fromBlock: 0, toBlock: 'latest'});

            logs[0].event.should.be.equal('EggClaimed');
            logs[0].args.user.should.be.equal(userAccount);
            logs[0].args.id.should.be.eq.BN(eggsAfter[0]);

            const distribitionAfter = await distribution.getInfo();
            logs[1].event.should.be.equal('DistributionUpdated');
            logs[1].args.restAmount.should.be.eq.BN(distribitionAfter[0]);
            logs[1].args.lastBlock.should.be.eq.BN(distribitionAfter[2]);
        });

        it("cannot be called when paused", async () => {
            await upgradeController.returnOwnership(mainBase.address);
            await mainBase.pause({from: owner});
            const error = await mainBase.claimEgg(0, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })

        it("specific egg type can be claimed only", async () => {

            let error = await mainBase.claimEgg(1, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('not a current type of dragon');
            error = await mainBase.claimEgg(6, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('not a current type of dragon');

            await mainBase.claimEgg(0, {from: userAccount});

            error = await mainBase.claimEgg(0, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('not a current type of dragon');
            error = await mainBase.claimEgg(2, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('not a current type of dragon');
        })

        it.skip("should throw if too early to claim", async () => {
            await mainBase.claimEgg(0, {from: userAccount});
            const error = await mainBase.claimEgg(1, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('too early');

            // block = await distribution.getBlock();
            // await distribution.setBlock(block.add(toBN(1)));
            // await mainBase.claimEgg(1, {from: userAccount});

            // error = await mainBase.claimEgg(2, {from: userAccount}).should.be.rejected;
            // error.reason.should.be.equal('too early');
        })
    })

    describe('#sendToNest', async () => {
        const dragonTypes = [0,1,2,3,4]
        const NUMBER_OF_EGG = 10
        sender = accounts[5];

        beforeEach("create eggs", async () => {
            eggIds = []

            for (let i = 0; i < NUMBER_OF_EGG; i++) {
                await mainBase.claimEgg(dragonTypes[i % 5], {from: sender});
                eggIds.push(i+1);
            }
        })

        it("event sent after sending eggs to the nest", async () => {
            let eggId = 1;
            const { receipt } = await mainBase.sendToNest(eggId, {from: sender});

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('EggSentToNest');
            logs[0].args.user.should.be.equal(sender);
            logs[0].args.id.should.be.eq.BN(eggId);

        });

        it("event sent after hatching egg", async () => {
            for (let i = 0; i < NUMBER_OF_EGG; i++) {
                const { receipt } = await mainBase.sendToNest(eggIds[i], {from: sender});
                if (i>1){
                    const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
                    logs[0].event.should.be.equal('EggSentToNest');
                    logs[0].args.user.should.be.equal(sender);
                    logs[0].args.id.should.be.eq.BN(eggIds[i]);
                    logs[1].event.should.be.equal('EggHatched');
                    logs[1].args.user.should.be.equal(sender);
                    logs[1].args.dragonId.should.be.eq.BN(i-1);
                    logs[1].args.eggId.should.be.eq.BN(eggIds[i-2]);
                }
            }
        });
        it("create dragon from first generations egg", async() => {
            //create to dragon
            dragonIds = []
            for (let i = 0; i < 4; i++) {
                await mainBase.sendToNest(eggIds[i], {from: sender});
                if (i > 1)  dragonIds.push(i - 1);
            }
            //get the egg from the dragons
            await dragonStorage.setLevel(dragonIds[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonIds[1], 1, 0, 10, {from: controller});
            await mainBase.breed(dragonIds[0], dragonIds[1], {from: sender}).should.be.fulfilled;
            let newEggId = 11;

            //create dragon from new egg
            await mainBase.sendToNest(newEggId, {from: sender});
            dragonIds.push(3);
            await mainBase.sendToNest(eggIds[4], {from: sender});
            dragonIds.push(4);
            let {receipt} = await mainBase.sendToNest(eggIds[5], {from: sender});
            dragonIds.push(5);

            //check the settings of new dragons
            let block = receipt.blockNumber;
            logs = await events.getPastEvents({fromBlock: block, toBlock: 'latest'});
            let expectedDragonId = dragonIds[dragonIds.length - 1];
            logs[1].event.should.be.equal('EggHatched');
            logs[1].args.user.should.be.equal(sender);
            logs[1].args.dragonId.should.be.eq.BN(expectedDragonId);
            logs[1].args.eggId.should.be.eq.BN(newEggId);
            let newDragonId = logs[1].args.dragonId;
            let dragonInfo = await getter.getDragonProfile(newDragonId);
            (dragonInfo.generation).should.be.eq.BN(1);
            let bithTime = (await web3.eth.getBlock(block)).timestamp;
            (dragonInfo.birth).should.be.eq.BN(bithTime);
            (dragonInfo.level).should.be.eq.BN(0);
            (dragonInfo.experience).should.be.eq.BN(0);
            (dragonInfo.dnaPoints).should.be.eq.BN(0);
            (dragonInfo.isBreedingAllowed).should.be.equal(false);
            (dragonInfo.coolness).should.be.not.eq.BN(0);
        });
    })

    describe('#Dragon', async () => {
        //const senders = [accounts[5], accounts[6], accounts[7], accounts[8]];
        const senders = [accounts[5]]
        const NUMBER_OF_SENDERS = senders.length;
        const dragonTypes = [0,1,2,3,4]

        //set the required number of dragons
        const NUMBER_OF_DRAGON = 1

        const DRAGON_NAME_2_LETTERS_PRICE = 100000;
        const DRAGON_NAME_3_LETTERS_PRICE = 10000;
        const DRAGON_NAME_4_LETTERS_PRICE = 1000;

        beforeEach("create dragons", async () => {
            eggId = []
            dragonId = []
            //create eggs for accounts from senders array
            for (let i = 0; i <= NUMBER_OF_DRAGON + 2; i++) {
                await mainBase.claimEgg(dragonTypes[i % 5], {from: senders[i % NUMBER_OF_SENDERS]});
                eggId.push(i+1);
            }
            //send eggs to nest
            for (let i = 0; i < NUMBER_OF_DRAGON + 2; i++) {
                await mainBase.sendToNest(eggId[i], {from: senders[i % NUMBER_OF_SENDERS]});
                if (i > 1)  dragonId.push(i - 1);
            }
        });

        async function setName(sender, dragonId, name, price) {
            let amount = (new BN(price)).mul((new BN(10)).pow(new BN(18)));
            let balanceOfGoldBefore = await gold.balanceOf(sender);
            await mainBase.setDragonName(dragonId, name, {from: sender});
            let balanceOfGoldAfter = await gold.balanceOf(sender);
            (new BN(balanceOfGoldAfter)).add(amount).should.be.eq.BN(balanceOfGoldBefore);
        }

        it("set the name of the dragon by paying in gold (2 letters)", async () => {
            await treasury.giveGold(senders[0], toWei('100000'), {from: controller});
            await setName(senders[0], dragonId[0], "Ab", DRAGON_NAME_2_LETTERS_PRICE);
        });

        it("set the name of the dragon by paying in gold (3 letters)", async () => {
            await treasury.giveGold(senders[0], toWei('10000'), {from: controller});
            await setName(senders[0], dragonId[0], "AbC", DRAGON_NAME_3_LETTERS_PRICE);
        });

        it("set the name of the dragon by paying in gold (4 letters)", async () => {
            await treasury.giveGold(senders[0], toWei('1000'), {from: controller});
            await setName(senders[0], dragonId[0], "AbCd", DRAGON_NAME_4_LETTERS_PRICE);
        });

        it("set the name of the dragon by paying in gold (10 letters)", async () => {
            await treasury.giveGold(senders[0], toWei('1000'), {from: controller});
            await setName(senders[0], dragonId[0], "AbCdEfGhIj", DRAGON_NAME_4_LETTERS_PRICE);
        });

        it("skills are calculated correctly", async () => {
            let dragon = dragonId[0];
            let genome = await getter.getDragonGenome(dragon);
            let actualSkills = await dragonStorage.skills(dragon);
            let expectedSkills = [0, 0, 0, 0, 0]
            for (let i = 0; i < 10; i++) {
                bodyPartsFactors = await dragonParams.bodyPartsFactors(i);
                dragonTypesFactors = await dragonParams.dragonTypesFactors(genome[i * 3]);
                geneTypesFactors = await dragonParams.geneTypesFactors(genome[i * 3 + 1]);
                level = genome[i * 3 + 2];
                for (let j = 0; j < 5; j++) {
                    expectedSkills[j] = (new BN(expectedSkills[j])).add((toBN(bodyPartsFactors[j])).mul(toBN(dragonTypesFactors[j])).mul(toBN(geneTypesFactors[j]).mul(toBN(level))));
                }
            }
            for (let i = 0; i < 5; i++) {
                actualSkills[i].should.be.eq.BN(expectedSkills[i]);
            }
        });
        it("health and mana points are calculated correctly", async () => {
            let dragonSkills = await dragonStorage.skills(dragonId[0]);
            let stamina = dragonSkills.stamina;
            let intelligence = dragonSkills.intelligence;
            let maxHealthAndMana = await getter.getDragonMaxHealthAndMana(dragonId[0]);
            let mana = maxHealthAndMana.maxMana;
            let health = maxHealthAndMana.maxHealth;
            health.should.be.eq.BN(stamina.mul(toBN(5)));
            mana.should.be.eq.BN(intelligence.mul(toBN(5)));
        });
    })

    describe('#Breed', async () => {
        const sender = accounts[5];
        const dragonTypes = [0,1,2,3,4]
        //set the required number of dragons
        const NUMBER_OF_DRAGON = 2
        dnaPoints = [0, 10, 13, 16, 21, 28, 37, 48, 62, 81, 106];

        beforeEach("create dragons", async () => {
            eggId = []
            dragonId = []
            //create eggs for accounts from senders array
            for (let i = 0; i <= NUMBER_OF_DRAGON + 4; i++) {
                await mainBase.claimEgg(dragonTypes[i % 5], {from: sender});
                eggId.push(i+1);
            }
            //send eggs to nest
            for (let i = 0; i < NUMBER_OF_DRAGON + 2; i++) {
                await mainBase.sendToNest(eggId[i], {from: sender});
                if (i > 1)  {
                    dragonId.push(i - 1);
                }
            }
        })

        it("the failure of breeding when the first or second dragon is level zero", async () => {
            let error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon has no enough DNA points for breeding")
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon has no enough DNA points for breeding")
        });

        it("the failure of breeding when the first or second dragon has less than 10 DNA points", async () => {
            await dragonStorage.setLevel(dragonId[0], 1, 0, 9, {from: controller});
            let error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon has no enough DNA points for breeding")
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonId[1], 1, 0, 9, {from: controller});
            error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon has no enough DNA points for breeding")
        });

        it("the failure of breeding when the first or second dragon is on breading sale", async () => {
            const _maxPrice = toWei('0.1');
            const _minPrice = toWei('0.1');
            const _period = toBN(0);
            const _isGold = true;
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonId[1], 1, 0, 10, {from: controller});
            await mainMarket.sellBreeding(dragonId[0],_maxPrice, _minPrice, _period, _isGold, {from: sender});
            await mainMarket.sellBreeding(dragonId[1],_maxPrice, _minPrice, _period, _isGold, {from: sender});

            let error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon is on breeding sale");
            await mainMarket.removeBreedingFromSale(dragonId[0], {from: sender});
            error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon is on breeding sale");
        });

        it("the failure of breeding when the first or second dragon is on sale", async () => {
            const _maxPrice = toWei('0.1');
            const _minPrice = toWei('0.1');
            const _period = toBN(0);
            const _isGold = true;
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonId[1], 1, 0, 10, {from: controller});
            await mainMarket.sellDragon(dragonId[0],_maxPrice, _minPrice, _period, _isGold, {from: sender});
            await mainMarket.sellDragon(dragonId[1],_maxPrice, _minPrice, _period, _isGold, {from: sender});

            let error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon is on sale");
            await mainMarket.removeDragonFromSale(dragonId[0], {from: sender});
            error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon is on sale");
        });

        function getApplicantsHash(array) {
            return web3.utils.keccak256(web3.eth.abi.encodeParameter('uint256[]', array), { encoding: 'hex' });
        }

        it("the failure of breeding when the first or second dragon is on gladiator battle", async () => {
            const _tactics = [toBN(25), toBN(25)];
            const _isGold = false;
            const _bet = toWei('0.1');
            const _counter = toBN(5);
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonId[1], 1, 0, 10, {from: controller});
            await mainBattle.createGladiatorBattle(dragonId[0], _tactics, _isGold, _bet, _counter, {from: sender, value: toWei('0.1')})
            let error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon participates in gladiator battle");
            let dragonApplication = await getter.getDragonApplicationForGladiatorBattle(dragonId[0]);
            let battleID = dragonApplication.gladiatorBattleId;
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(battleID); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.cancelGladiatorBattle(battleID, hash, {from: sender});

            await mainBattle.createGladiatorBattle(dragonId[1], _tactics, _isGold, _bet, _counter, {from: sender, value: toWei('0.1')})
            error = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon participates in gladiator battle");
        });

        it("the failure of breeding when the first and second dragons the same", async () => {
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            let error = await mainBase.breed(dragonId[0], dragonId[0], {from: sender}).should.be.rejected;
            error.reason.should.be.equal("the same dragon")
        });
        it("the failure of breeding when the sender is not the owner of dragons", async () => {
            let notOwner = accounts[6]
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonId[1], 1, 0, 10, {from: controller});
            let error = await mainBase.breed(dragonId[0], dragonId[1], {from: notOwner}).should.be.rejected;
            error.reason.should.be.equal("not an owner")
        });

        it("successful breading", async () => {
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonId[1], 1, 0, 10, {from: controller});
            let receipt = await mainBase.breed(dragonId[0], dragonId[1], {from: sender}).should.be.fulfilled;
            let expectedEggId = eggId[eggId.length-1] + 1;
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('EggCreated');
            logs[0].args.user.should.be.equal(sender);
            logs[0].args.id.should.be.eq.BN(expectedEggId);
            let eggInfo = await eggCore.get(expectedEggId);
            eggInfo[0][0].should.be.eq.BN(dragonId[0]);
            eggInfo[0][1].should.be.eq.BN(dragonId[1]);
            eggInfo[1].should.be.eq.BN(0);
        });
        it("breading dragons with different generation", async () => {
            let dragon = await dragonGetter.getProfile(dragonId[0]);
            let generation = (dragon.generation).add(toBN(1));
            let genome = await dragonGetter.getComposedGenome(dragonId[0]);
            let parents = [toBN(1), toBN(2)];
            let types = await dragonGetter.getDragonTypes(dragonId[0]);
            let firstGenerationDragon = await dragonStorage.push.call(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.push(sender, generation, genome, parents, types, {from: controller});
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(firstGenerationDragon, 1, 0, 10, {from: controller});
            let receipt = await mainBase.breed(dragonId[0], firstGenerationDragon, {from: sender}).should.be.fulfilled;
            let logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            let newEggId = logs[0].args.id;
            const eggs = await eggStorage.tokensOfOwner(sender);
            await mainBase.sendToNest(newEggId, {from: sender}).should.be.fulfilled;
            await mainBase.sendToNest(eggs[0], {from: sender}).should.be.fulfilled;
            receipt = await mainBase.sendToNest(eggs[1], {from: sender}).should.be.fulfilled;
            let block = receipt.blockNumber;
            logs = await events.getPastEvents({fromBlock: block, toBlock: 'latest'});
            let newDragonId = logs[1].args.dragonId;
            let dragonInfo = await getter.getDragonProfile(newDragonId);
            (dragonInfo.generation).should.be.eq.BN(2);
        });
    })

    describe('#upgradeDragonGenes', async () => {
        const sender = accounts[5];
        const dragonTypes = [0,1,2,3,4]
        //set the required number of dragons
        const NUMBER_OF_DRAGON = 2
        dnaPoints = [0, 10, 13, 16, 21, 28, 37, 48, 62, 81, 106];

        beforeEach("create dragons", async () => {
            eggId = []
            dragonId = []
            //create eggs for accounts from senders array
            for (let i = 0; i <= NUMBER_OF_DRAGON + 2; i++) {
                await mainBase.claimEgg(dragonTypes[i % 5], {from: sender});
                eggId.push(i+1);
            }
            //send eggs to nest
            for (let i = 0; i < NUMBER_OF_DRAGON + 2; i++) {
                await mainBase.sendToNest(eggId[i], {from: sender});
                if (i > 1)  {
                    dragonId.push(i - 1);
                }
            }
        })

        it("upgrade Dragon Genes failed when there are not enough DNA points", async () => {
            let dragon = dragonId[0];
            let dragonlevels = await dragonStorage.levels(dragon);
            [level, experience, dragonDNAPoints] = [dragonlevels.level, dragonlevels.experience, dragonlevels.dnaPoints];
            level.should.be.eq.BN(0);
            experience.should.be.eq.BN(0);
            dragonDNAPoints.should.be.eq.BN(0);
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            const error = await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender}).should.be.rejected;
            error.reason.should.be.equal("not enough DNA points for upgrade");
        });

        it("upgrade Dragon Genes initiated not by the dragon owner failed", async () => {
            let dragon = dragonId[0];
            let notOwner = accounts[9];
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            const error = await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: notOwner}).should.be.rejected;
            error.reason.should.be.equal("not an owner");
        });

        it("after upgrade one part of the body, the gene has changed", async () => {
            let dragon = dragonId[0];
            let genomeBefore = await getter.getDragonGenome(dragon);
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender});
            const logs = await events.getPastEvents({fromBlock: 0, toBlock: 'latest'});
            logs[0].event.should.be.equal('DragonUpgraded');
            logs[0].args.id.should.be.eq.BN(dragon);
            let genomeAfter = await getter.getDragonGenome(dragon);
            genomeAfter.should.be.deep.not.equal(genomeBefore);
            let dragonlevels = await dragonStorage.levels(dragon);
            [level, experience, dragonDNAPoints] = [dragonlevels.level, dragonlevels.experience, dragonlevels.dnaPoints];
        });

        it("when a dragon has 10 dna points upgrade every body part at 1 point is not successful", async () => {
            let dragon = dragonId[0];
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            dnaPoints = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender}).should.be.rejected;
        });

        it("after updating one part of the body, the gene level of this part of the body increased", async () => {
            let dragon = dragonId[0];
            let genomeBefore = await getter.getDragonGenome(dragon);
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender});
            let genomeAfter = await getter.getDragonGenome(dragon);
            for (let i = 0; i < genomeBefore.length; i++) {
                if (i != 2)  {
                    genomeAfter[i].should.be.eq.BN(genomeBefore[i]);
                }
                else {
                    genomeAfter[i].sub(toBN(1)).should.be.eq.BN(genomeBefore[i]);
                }
            }
        });

        it("the required number of points to upgrade the body part increases", async () => {
            let dragon = dragonId[0];
            let geneUpgradeDNAPoints = await dragonParams.geneUpgradeDNAPoints(1);
            await dragonStorage.setLevel(dragon, 1, 0, geneUpgradeDNAPoints, {from: controller});
            dnaPoints = [geneUpgradeDNAPoints, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender});
            let genome = await getter.getDragonGenome(dragon);
            genome[2].should.be.eq.BN(2);
            let dragonlevels = await dragonStorage.levels(dragon);
            [level, experience, dragonDNAPoints] = [dragonlevels.level, dragonlevels.experience, dragonlevels.dnaPoints];
            dragonDNAPoints.should.be.eq.BN(0);
            await dragonStorage.setLevel(dragon, 1, 0, geneUpgradeDNAPoints, {from: controller});
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender});
            genome = await getter.getDragonGenome(dragon);
            genome[2].should.be.eq.BN(3);
            geneUpgradeDNAPoints = await dragonParams.geneUpgradeDNAPoints(3);
            dnaPoints = [geneUpgradeDNAPoints, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            let notEnought = geneUpgradeDNAPoints.sub(toBN(1));
            await dragonStorage.setLevel(dragon, 1, 0, notEnought, {from: controller});
            const error = await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender}).should.be.rejected;
            error.reason.should.be.equal("not enough DNA points for upgrade");
            genome = await getter.getDragonGenome(dragon);
            genome[2].should.be.eq.BN(3);
            await dragonStorage.setLevel(dragon, 3, 0, geneUpgradeDNAPoints, {from: controller});
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender});
            genome = await getter.getDragonGenome(dragon);
            genome[2].should.be.eq.BN(4);
        });

        it("update 3 part of the body with different required number of points and different levels", async () => {
            let dragon = dragonId[0];
            let genomeBefore = await getter.getDragonGenome(dragon);
            await dragonStorage.setLevel(dragon, 1, 0, 61, {from: controller});
            dnaPoints = [31, 0, 20, 0, 10, 0, 0, 0, 0, 0];
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender});
            let genomeAfter = await getter.getDragonGenome(dragon);
            genomeAfter[2].should.be.eq.BN(4);
            genomeAfter[8].should.be.eq.BN(3);
            genomeAfter[14].should.be.eq.BN(2);
            for (let i = 0; i < genomeBefore.length; i++) {
                if (i != 2 & i != 8 & i != 14)  {
                    genomeAfter[i].should.be.eq.BN(genomeBefore[i]);
                }
            }
        });

        it("skills increase after upgrade genes", async () => {
            let dragon = dragonId[0];
            let genome = await getter.getDragonGenome(dragon);
            let skillsBefore = await dragonStorage.skills(dragon);
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender}).should.be.fulfilled;
            skillsAfter = await dragonStorage.skills(dragon);

            bodyPartsFactorHead = [1, 0, 1, 0, 1]
            dragonTypesFactors = await dragonParams.dragonTypesFactors(genome[0]);
            geneTypesFactors = await dragonParams.geneTypesFactors(genome[1]);
            level = 1
            for (let i = 0; i < 5; i++) {
                if (i % 2 == 0)  {
                    expectedSkill = (skillsBefore[i]).add((toBN(bodyPartsFactorHead[i])).mul(toBN(dragonTypesFactors[i])).mul(toBN(geneTypesFactors[i]).mul(toBN(level))));
                    expectedSkill.should.be.eq.BN(skillsAfter[i]);
                }
                else {
                    skillsBefore[i].should.be.eq.BN(skillsAfter[i]);
                }
            }
        });

        it("dragon is on breeding sale", async () => {
            let dragon = dragonId[0];
            const _maxPrice = toWei('0.1');
            const _minPrice = toWei('0.1');
            const _period = toBN(0);
            const _isGold = true;
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            await mainMarket.sellBreeding(dragon,_maxPrice, _minPrice, _period, _isGold, {from: sender});
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            const error = await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon is on breeding sale");
        });

        it("dragon is on sale", async () => {
            let dragon = dragonId[0];
            const _maxPrice = toWei('0.1');
            const _minPrice = toWei('0.1');
            const _period = toBN(0);
            const _isGold = true;
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            await mainMarket.sellDragon(dragon,_maxPrice, _minPrice, _period, _isGold, {from: sender});
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            const error = await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon is on sale");
        });

        it("dragon participates in gladiator battle", async () => {
            let dragon = dragonId[0];
            const _tactics = [toBN(25), toBN(25)];
            const _isGold = false;
            const _bet = toWei('0.1');
            const _counter = toBN(5);
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            await mainBattle.createGladiatorBattle(dragon, _tactics, _isGold, _bet, _counter, {from: sender, value: toWei('0.1')})
            const error = await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender}).should.be.rejected;
            error.reason.should.be.equal("dragon participates in gladiator battle");
        });

        it("decrease points the DNA of a dragon after the update.", async () => {
            let dragon = dragonId[0];
            await dragonStorage.setLevel(dragon, 1, 0, 10, {from: controller});
            dnaPoints = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            await mainBase.upgradeDragonGenes(dragon, dnaPoints, {from: sender});
            let dragonlevels = await dragonStorage.levels(dragon);
            [level, experience, dragonDNAPoints] = [dragonlevels.level, dragonlevels.experience, dragonlevels.dnaPoints];
            dragonDNAPoints.should.be.eq.BN(0);
        });
    })

    describe('#setDragonTactics', async () => {
        const sender = accounts[5];
        it('should work', async () => {
            const melee = toBN(30);
            const attack = toBN(31);
            let dragon = (await createDragons(1, [sender]))[0];
            const tacticsBefore = await dragonGetter.getTactics(dragon);
            await mainBase.setDragonTactics(dragon, melee, attack, {from: sender});
            const tacticsAfter = await dragonGetter.getTactics(dragon);
            tacticsAfter[0].should.be.eq.BN(melee);
            tacticsAfter[1].should.be.eq.BN(attack);
        })

        it('cannot set for foreign dragon', async () => {
            let dragon = (await createDragons(1, [sender]))[0];

            let error = await mainBase.setDragonTactics(dragon, 30, 50, {from: accounts[0]}).should.be.rejected;
            error.reason.should.be.equal("not an owner");
        })

        it('tactics should be between 20 and 80', async () => {
            let dragon = (await createDragons(1, [sender]))[0];

            let error = await mainBase.setDragonTactics(dragon, 19, 80, {from: sender}).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBase.setDragonTactics(dragon, 0, 80, { from: sender }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBase.setDragonTactics(dragon, 81, 80, { from: sender }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBase.setDragonTactics(dragon, 1001, 80, { from: sender }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");

            error = await mainBase.setDragonTactics(dragon, 80, 19, { from: sender }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBase.setDragonTactics(dragon, 80, 0, { from: sender }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBase.setDragonTactics(dragon, 80, 81, { from: sender }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBase.setDragonTactics(dragon, 80, 1000, { from: sender }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
        })
    })

    async function createDragons(numberOfDragons, owners) {
        const race = [0,1,2,3,4]
        const NUMBER_OF_OWNERS = owners.length;
        let eggIds = []
        let dragonId = []
        for (let i = 0; i < numberOfDragons + 2; i++) {
            await mainBase.claimEgg(race[i % 5], {from: owners[i % NUMBER_OF_OWNERS]});
            eggIds.push(i+1);
        }
        for (let i = 0; i < numberOfDragons + 2; i++) {
            await mainBase.sendToNest(eggIds[i], {from: owners[i % NUMBER_OF_OWNERS]});
            if (i > 1)  dragonId.push(i - 1);
        }
        return dragonId
    }

    describe('#distributeLeaderboardRewards', async () => {
        it('should work', async () => {
            const hatchingPrice = await treasury.hatchingPrice();
            const rewardCoefficients = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5];
            const senders = [accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]];
            let dragonIds = await createDragons(10, senders);

            let positions = await dragonLeaderboard.getDragonsFromLeaderboard();
            let balancesBefore = [];
            for(i=0; i< positions.length; i++) {
                let owner = await getter.ownerOfDragon(positions[i]);
                balancesBefore.push(await gold.balanceOf(owner));
            }

            const {timestamp} = await web3.eth.getBlock('latest');
            await mineBlock(timestamp + 60*60*24 + 1);
            await mainBase.distributeLeaderboardRewards();

            let balancesAfter = [];
            for(i=0; i< positions.length; i++) {
                let owner = await getter.ownerOfDragon(positions[i]);
                balancesAfter.push(await gold.balanceOf(owner));
            }
            for(i=0; i< positions.length; i++) {
                let reward = hatchingPrice.mul(toBN(rewardCoefficients[i])).div(toBN(10));
                toBN(balancesAfter[i]).sub(toBN(balancesBefore[i])).should.be.eq.BN(reward);
            }
        })

        it('only one time per day', async () => {
            const senders = [accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]];
            let dragonIds = await createDragons(11, senders);

            let balancesBefore = [];
            for(i=0; i< senders.length; i++) {
                balancesBefore.push(await gold.balanceOf(senders[i]));
            }

            const {timestamp} = await web3.eth.getBlock('latest');
            await mineBlock(timestamp + 60*60*24 + 1);
            await mainBase.distributeLeaderboardRewards();

            const error =await mainBase.distributeLeaderboardRewards().should.be.rejected;
            error.reason.should.be.equal("too early");
        })
    })

    describe('#setDragonSpecialPeacefulSkill', async () => {
        const sender = accounts[5];

        async function setSpecialPeacefulSkill(sender, dragon, skillId) {
            await dragonStorage.setLevel(dragon, 10, 0, 0, {from: controller});
            return await mainBase.setDragonSpecialPeacefulSkill(dragon, skillId, {from: sender});
        }

        it("check that setting special peaceful skill not available when the dragon has not reached the maximum level", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let skillId = 1;
            let error = await mainBase.setDragonSpecialPeacefulSkill(dragon, skillId, {from: sender}).should.be.rejected;
            error.reason.should.be.equal("special peaceful skill selection is not available");
            await setSpecialPeacefulSkill(sender, dragon, skillId).should.be.fulfilled;
        });

        it("check that setting special peaceful skill not available when skill is already set", async () => {
            //you can't change skill
            //you can't have two skills
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let skillId = 1;
            await setSpecialPeacefulSkill(sender, dragon, skillId).should.be.fulfilled;
            for (let i = 2; i < 8; i++) {
                error = await mainBase.setDragonSpecialPeacefulSkill(dragon, i, {from: sender}).should.be.rejected;
                error.reason.should.be.equal("special peaceful skill selection is not available");
            }
        });

        it("check that setting special peaceful skill not available when you are not the owner of this dragon", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let notOwner = accounts[9];
            let skillId = 1;
            let error = await setSpecialPeacefulSkill(notOwner, dragon, skillId).should.be.rejected;
            error.reason.should.be.equal("not an owner");
        });

        it("check that setting not valid special peaceful skill not available", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let notValidSkillId = [0, 8];
            let error = await setSpecialPeacefulSkill(sender, dragon, notValidSkillId[0]).should.be.rejected;
            error.reason.should.be.equal("wrong class of special peaceful skill");
            error = await setSpecialPeacefulSkill(sender, dragon, notValidSkillId[1]).should.be.rejected;
            error.reason.should.be.equal("wrong class of special peaceful skill");
        });

        it("skill installed successfully for dragon maximum level", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let expectedSkill = 1;
            await setSpecialPeacefulSkill(sender, dragon, expectedSkill).should.be.fulfilled;
            let dragonSkill = await getter.getDragonSpecialPeacefulSkill(dragon);
            let actualSkill = dragonSkill.class;
            actualSkill.should.be.eq.BN(expectedSkill);
        });

        it("check that the special peace skill, effect and cost were established correctly", async () => {
            let dragonId = await createDragons(8, [sender])
            let expectedCost;
            let expectedEffect;
            let dragonSkills;
            let skill;
            let actualSkill;
            let actualCost;
            let actualEffect;
            for (let i = 1; i < 8; i++) {
                    dragonSkills = await dragonStorage.skills(dragonId[i]);
                    if (i < 6) {
                        skill = dragonSkills[i-1];
                        expectedCost = (new BN(skill)).mul(toBN(3));
                        skill = skill.mul(toBN(10)).div(toBN(3));
                        x = skill.toNumber();
                        y = Math.floor(Math.sqrt(x));
                        expectedEffect = (new BN(y)).add(toBN(100));
                    }
                    if (i == 6) {
                        dragonSkills = await dragonStorage.skills(dragonId[i]);
                        skill = dragonSkills.stamina;
                        expectedCost = (new BN(skill)).mul(toBN(3));
                        expectedEffect = (new BN(skill)).mul(toBN(2));
                    }
                    if (i == 7) {
                        dragonSkills = await dragonStorage.skills(dragonId[i]);
                        skill = dragonSkills.intelligence;
                        expectedCost = (new BN(skill)).mul(toBN(3));
                        expectedEffect = (new BN(skill)).mul(toBN(2));
                    }
                    await setSpecialPeacefulSkill(sender, dragonId[i], i).should.be.fulfilled;
                    dragonSkill = await getter.getDragonSpecialPeacefulSkill(dragonId[i]);
                    actualSkill = dragonSkill.class;
                    actualCost = dragonSkill.cost;
                    actualEffect = dragonSkill.effect;
                    actualSkill.should.be.eq.BN(i);
                    actualCost.should.be.eq.BN(expectedCost);
                    actualEffect.should.be.eq.BN(expectedEffect);
                }
        });
        it("a special skill does not change all skills", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let skillId = 1;
            let tactics = [80, 80];
            expectedSkills = await dragonStorage.skills(dragon);
            expectedSpeed = expectedSkills.speed;
            expectedDefense = expectedSkills.defense;
            await setSpecialPeacefulSkill(sender, dragon, skillId);
            dragonSkill = await getter.getDragonSpecialPeacefulSkill(dragon);
            actualCost = dragonSkill.cost;
            await mainBase.useDragonSpecialPeacefulSkill(dragon, dragon, {from: sender});
            actualSkills = await battle.initDragon(dragon, target, tactics, false);
            (actualSkills.speed).should.be.eq.BN(expectedSpeed);
            (actualSkills.defense).should.be.eq.BN(expectedDefense);
        });

        async function setAndUseSpecialPeacefulSkill(dragon, target, skillId, sender) {
            let tactics = [80, 80];
            let dragonSkills = await dragonStorage.skills(target);
            let dragonSkill = dragonSkills[skillId - 1];
            await setSpecialPeacefulSkill(sender, dragon, skillId);
            dragonSpecialSkill = await getter.getDragonSpecialPeacefulSkill(dragon);
            actualEffect = dragonSpecialSkill.effect;
            if (skillId == 1) {
                dragonSkill = await battle.initBaseDragon(target, dragon, tactics[0], tactics[1], false);
            }
            expectedSkillkWithBuff = dragonSkill.mul(actualEffect).div(toBN(100));
            await mainBase.useDragonSpecialPeacefulSkill(dragon, target, {from: sender});
            if (skillId == 3 || skillId == 5) {
                expectedSkillkWithBuff = expectedSkillkWithBuff.mul(toBN(5));
                dragonBuffs = await dragonGetter.getBuffs(target);
                let targetSkills = await dragonStorage.skills(target);
                calculateHealthAndMana = await dragonCoreHelper.calculateHealthAndMana(
                    targetSkills.stamina,
                    targetSkills.intelligence,
                    dragonBuffs[2],
                    dragonBuffs[4]);

                if (skillId == 3)(calculateHealthAndMana.health).should.be.eq.BN(expectedSkillkWithBuff);
                else (calculateHealthAndMana.mana).should.be.eq.BN(expectedSkillkWithBuff);
            }
            else {
                actualSkills = await battle.initDragon(target, dragon, tactics, false);
                actualSkillWithBuff = actualSkills[skillId-1];
                actualSkillWithBuff.should.be.eq.BN(expectedSkillkWithBuff);
            }
        }

        it("use attack boost skill", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let skillId = 1;
            await setAndUseSpecialPeacefulSkill(dragon, target, skillId, sender);
        });

        it("use defense boost skill", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let skillId = 2;
            await setAndUseSpecialPeacefulSkill(dragon, target, skillId, sender);
        });

        it("use stamina boost skill", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let skillId = 3;
            let skills = await dragonStorage.skills(dragon);
            await dragonStorage.setSkills(
                dragon,
                skills.attack,
                skills.defense,
                skills.stamina,
                skills.speed,
                skills.stamina, {from: controller});
            await setAndUseSpecialPeacefulSkill(dragon, dragon, skillId, sender);
        });

        it("use speed boost skill", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let skillId = 4;
            await setAndUseSpecialPeacefulSkill(dragon, dragon, skillId, sender);
        });

        it("use intelligence boost skill", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let skillId = 5;
            await setAndUseSpecialPeacefulSkill(dragon, dragon, skillId, sender);
        });

        it("use healing boost skill", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let expectedSkill = 6;
            let skills = await dragonStorage.skills(dragon);
            await dragonStorage.setSkills(
                dragon,
                skills.attack,
                skills.defense,
                skills.stamina,
                skills.speed,
                skills.stamina, {from: controller});
            await setSpecialPeacefulSkill(sender, dragon, expectedSkill).should.be.fulfilled;
            dragonSkill = await getter.getDragonSpecialPeacefulSkill(dragon);
            actualCost = dragonSkill.cost;
            actualEffect = dragonSkill.effect;
            await dragonStorage.setRemainingHealthAndMana(target, 0, 0, {from: controller});
            let healthAndManaDragon = await dragonCore.getCurrentHealthAndMana(dragon);
            let manaDragonBefore = healthAndManaDragon.mana;
            await mainBase.useDragonSpecialPeacefulSkill(dragon, target, {from: sender});
            healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            healthAndManaTarget = await dragonGetter.getHealthAndMana(target);
            (healthAndManaTarget.remainingHealth).should.be.eq.BN(actualEffect);
            (new BN(healthAndManaDragon.remainingMana)).add(toBN(actualCost)).should.be.eq.BN(manaDragonBefore);
        });

        it("use healing boost skill fills no more than the maximum", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let expectedSkill = 6;
            let skills = await dragonStorage.skills(dragon);
            await dragonStorage.setSkills(
                dragon,
                skills.attack,
                skills.defense,
                skills.stamina,
                skills.speed,
                skills.stamina, {from: controller});
            await setSpecialPeacefulSkill(sender, dragon, expectedSkill).should.be.fulfilled;
            dragonSkill = await getter.getDragonSpecialPeacefulSkill(dragon);
            actualCost = dragonSkill.cost;
            actualEffect = dragonSkill.effect;
            let healthAndManaTarget = await dragonCore.getCurrentHealthAndMana(target);
            let halfOfHealth = (healthAndManaTarget.health).sub(toBN(1))
            let maxHealth = healthAndManaTarget.health;
            await dragonStorage.setRemainingHealthAndMana(target, halfOfHealth, 0, {from: controller});
            let healthAndManaDragon = await dragonCore.getCurrentHealthAndMana(dragon);
            let manaDragonBefore = healthAndManaDragon.mana;
            await mainBase.useDragonSpecialPeacefulSkill(dragon, target, {from: sender});
            healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            healthAndManaTarget = await dragonCore.getCurrentHealthAndMana(target);
            (healthAndManaTarget.health).should.be.eq.BN(maxHealth);
            healthAndManaTarget = await dragonGetter.getHealthAndMana(target);
            (healthAndManaTarget.remainingHealth).should.be.eq.BN(maxHealth);
            (new BN(healthAndManaDragon.remainingMana)).add(toBN(actualCost)).should.be.eq.BN(manaDragonBefore);
        });

        it("use mana recharge boost skill fills no more than the maximum", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let expectedSkill = 7;
            await setSpecialPeacefulSkill(sender, dragon, expectedSkill).should.be.fulfilled;
            dragonSkill = await getter.getDragonSpecialPeacefulSkill(dragon);
            actualCost = dragonSkill.cost;
            actualEffect = dragonSkill.effect;
            let healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            let manaDragonBefore = healthAndManaDragon.maxMana;
            let healthAndManaTarget = await dragonCore.getCurrentHealthAndMana(target);
            let halfOfMana = (healthAndManaTarget.mana).sub(toBN(1))
            let maxMana = healthAndManaTarget.mana;
            await dragonStorage.setRemainingHealthAndMana(target, 0, halfOfMana, {from: controller});
            await mainBase.useDragonSpecialPeacefulSkill(dragon, target, {from: sender});
            healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            healthAndManaTarget = await dragonCore.getCurrentHealthAndMana(target);
            (healthAndManaTarget.mana).should.be.eq.BN(maxMana);
            healthAndManaTarget = await dragonGetter.getHealthAndMana(target);
            (healthAndManaTarget.remainingMana).should.be.eq.BN(maxMana);
            (new BN(healthAndManaDragon.remainingMana)).add(toBN(actualCost)).should.be.eq.BN(manaDragonBefore);
        });

        it("use mana recharge boost skill", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let expectedSkill = 7;
            await setSpecialPeacefulSkill(sender, dragon, expectedSkill).should.be.fulfilled;
            dragonSkill = await getter.getDragonSpecialPeacefulSkill(dragon);
            actualCost = dragonSkill.cost;
            actualEffect = dragonSkill.effect;
            let healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            let manaDragonBefore = healthAndManaDragon.maxMana;
            await dragonStorage.setRemainingHealthAndMana(target, 0, 0, {from: controller});
            await mainBase.useDragonSpecialPeacefulSkill(dragon, target, {from: sender});
            healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            healthAndManaTarget = await dragonGetter.getHealthAndMana(target);
            (healthAndManaTarget.remainingMana).should.be.eq.BN(actualEffect);
            (new BN(healthAndManaDragon.remainingMana)).add(toBN(actualCost)).should.be.eq.BN(manaDragonBefore);
        });

        it("the effect of the skill is not applied in the next battle", async () => {
            var senders = [accounts[5], accounts[6]];
            let dragonId = await createDragons(2, senders)
            let dragon = dragonId[0];
            let target = dragonId[1];
            let skillId = 2;
            let tactics = [80, 80];
            await setAndUseSpecialPeacefulSkill(dragon, target, skillId, sender);
            expectedSkills = await dragonStorage.skills(dragon);
            dragonDefenseWithoutBuff = expectedSkills.defense;
            await battle.initDragon(dragon, target, tactics, false);
            await mainBattle.battle(dragon, target, tactics, {from: sender});
            dragonBuffs = await dragonGetter.getBuffs(dragon);
            defenseBuff = dragonBuffs[1];
            defenseBuff.should.be.eq.BN(0);
            actualSkills = await battle.initDragon(dragon, target, tactics, false);
            actualDefense = actualSkills.defense;
            actualDefense.should.be.eq.BN(dragonDefenseWithoutBuff);
        });
        it("set and use boost skill second times", async () => {
            var senders = [accounts[5], accounts[6]];
            let dragonId = await createDragons(2, senders)
            let dragon = dragonId[0];
            let target = dragonId[1];
            let skillId = 1;
            let tactics = [80, 80];
            await setAndUseSpecialPeacefulSkill(dragon, target, skillId, sender);
            await mainBattle.battle(dragon, target, tactics, {from: sender});
            let healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            let maxMana = healthAndManaDragon.maxMana;
            await dragonStorage.setRemainingHealthAndMana(dragon, 0, maxMana, {from: controller});
            await mainBase.useDragonSpecialPeacefulSkill(dragon, dragon, {from: sender});
            dragonBuffs = await dragonGetter.getBuffs(dragon);
            attackBuff = dragonBuffs[0];
            attackBuff.should.be.eq.BN(actualEffect);
        });
        it("calculate effect and cost when dragon allready has buff", async () => {
            let dragonId = await createDragons(6, [sender])
            let expectedCost;
            let expectedEffect;
            let dragonSkills;
            let skill;
            for (let i = 1; i < 6; i++) {
                    await setAndUseSpecialPeacefulSkill(dragonId[i], dragonId[i], i, sender);
                    dragonSkills = await dragonStorage.skills(dragonId[i]);
                    dragonBuffs = await dragonGetter.getBuffs(dragonId[i]);
                    skill = dragonSkills[i-1].mul(dragonBuffs[i-1]).div(toBN(100));
                    expectedCost = (new BN(skill)).mul(toBN(3));
                    skill = skill.mul(toBN(10)).div(toBN(3));
                    x = skill.toNumber();
                    y = Math.floor(Math.sqrt(x));
                    expectedEffect = (new BN(y)).add(toBN(100));
                    dragonSkill = await dragonCore.calculateSpecialPeacefulSkill(dragonId[i]);
                    (dragonSkill.class).should.be.eq.BN(i);
                    (dragonSkill.cost).should.be.eq.BN(expectedCost);
                    (dragonSkill.effect).should.be.eq.BN(expectedEffect);
                }
        });

        it("use attack boost skill if dragon has buff on attack", async () => {
            let dragonId = await createDragons(1, [sender])
            let dragon = dragonId[0];
            let skillId = 1;
            let healthAndManaDragon = await dragonGetter.getHealthAndMana(dragon);
            let maxMana = healthAndManaDragon.maxMana;
            await setAndUseSpecialPeacefulSkill(dragon, dragon, skillId, sender);
            let dragonBuffs = await dragonGetter.getBuffs(dragon);
            let attackBuffBefore = dragonBuffs[0];
            await dragonStorage.setRemainingHealthAndMana(dragon, 0, maxMana, {from: controller});
            await mainBase.useDragonSpecialPeacefulSkill(dragon, dragon, {from: sender});
            dragonBuffs = await dragonGetter.getBuffs(dragon);
            let attackBuffAfter = dragonBuffs[0];
            attackBuffAfter.should.be.not.eq.BN(0);
            attackBuffAfter.should.be.gt.BN(attackBuffBefore);
        });

        it("use special peace skill if dragon has buff on intelligence", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let intelligence = 5;
            let attack = 1;
            await setAndUseSpecialPeacefulSkill(dragon, target, intelligence, sender);
            dragonSkill = await dragonCore.calculateSpecialPeacefulSkill(dragon);
            let dragonBuffs = await dragonGetter.getBuffs(target);
            let intelligenceBuff = dragonBuffs[4];
            (intelligenceBuff).should.be.eq.BN(dragonSkill.effect);
            await setAndUseSpecialPeacefulSkill(target, target, attack, sender);
            dragonBuffs = await dragonGetter.getBuffs(target);
            let attackBuff = dragonBuffs[0];
            intelligenceBuff = dragonBuffs[4];
            attackBuff.should.be.not.eq.BN(0);
            (intelligenceBuff).should.be.eq.BN(0);
        });

        it("use healing skill if dragon has buff on stamina", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let skillId = 3;
            let skills = await dragonStorage.skills(dragon);
            await dragonStorage.setSkills(
                dragon,
                skills.attack,
                skills.defense,
                skills.stamina,
                skills.speed,
                skills.stamina, {from: controller});
            await setAndUseSpecialPeacefulSkill(dragon, target, skillId, sender);
            dragonBuffs = await dragonGetter.getBuffs(target);
            let healing = 6;
            skills = await dragonStorage.skills(target);
            await setSpecialPeacefulSkill(sender, target, healing).should.be.fulfilled;
            let dragonSkill = await dragonCore.calculateSpecialPeacefulSkill(target);
            skill = (skills.stamina).mul(dragonBuffs[2]).div(toBN(100));
            expectedCost = (new BN(skill)).mul(toBN(3));
            expectedEffect = (new BN(skill)).mul(toBN(2));
            (dragonSkill.class).should.be.eq.BN(healing);
            (dragonSkill.cost).should.be.eq.BN(expectedCost);
            (dragonSkill.effect).should.be.eq.BN(expectedEffect);
        });

        it("use mana recharge skill if dragon has buff on stamina", async () => {
            let dragonId = await createDragons(2, [sender])
            let dragon = dragonId[0];
            let target = dragonId[1];
            let skillId = 5;
            let skills = await dragonStorage.skills(dragon);
            await setAndUseSpecialPeacefulSkill(dragon, target, skillId, sender);
            dragonBuffs = await dragonGetter.getBuffs(target);
            let manaRecharge = 7;
            skills = await dragonStorage.skills(target);
            await setSpecialPeacefulSkill(sender, target, manaRecharge).should.be.fulfilled;
            let dragonSkill = await dragonCore.calculateSpecialPeacefulSkill(target);
            skill = (skills.intelligence).mul(dragonBuffs[4]).div(toBN(100));
            expectedCost = (new BN(skill)).mul(toBN(3));
            expectedEffect = (new BN(skill)).mul(toBN(2));
            (dragonSkill.class).should.be.eq.BN(manaRecharge);
            (dragonSkill.cost).should.be.eq.BN(expectedCost);
            (dragonSkill.effect).should.be.eq.BN(expectedEffect);
        });


    })
})
