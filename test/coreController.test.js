const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

const {takeSnapshot,revertSnapshot} = require('../scripts/ganacheHelper.js');


contract('CoreController', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const team = accounts[2];
    let snapshotId;
    before(async () => {
        ({
            treasury, dragonStorage, core, distribution,
            getter, coreController, mainBase, gold, upgradeController,
        } = await deployer(owner, team));

        await upgradeController.returnOwnership(coreController.address);
        await coreController.setExternalDependencies([controller], {from: owner}).should.be.fulfilled;
        await coreController.transferOwnership(upgradeController.address);

        await upgradeController.returnOwnership(dragonStorage.address);
        let dragonStorageExternalDependencies = await dragonStorage.getExternalDependencies();
        dragonStorageExternalDependencies.push(controller);
        await dragonStorage.setExternalDependencies(dragonStorageExternalDependencies, {from: owner}).should.be.fulfilled;
        await dragonStorage.transferOwnership(upgradeController.address);

        // let distributionNew = await Distribution.new({from: owner});
        // await distributionNew.transferOwnership(upgradeController.address);
        // await upgradeController.migrate(distribution.address, distributionNew.address, {from: owner});
        // distribution = distributionNew;
        snapshotId = await takeSnapshot();
    })
    afterEach(async () => {
      await revertSnapshot(snapshotId.result);
      snapshotId = await takeSnapshot();
    })

    describe('#claimEgg', async () => {
        const sender = accounts[7];
        const dragonType = 0;
        const dragonTwoType = 1;

        it('distribution changed', async () => {
            await coreController.claimEgg(sender, dragonType, {from: controller});

            const distribitionBefore = await distribution.getInfo();
            const result = await coreController.claimEgg.call(sender, dragonTwoType, {from: controller});
            [eggId, restAmount, lastBlock] = [result.eggId, result.restAmount, result.lastBlock];
            await coreController.claimEgg(sender, dragonTwoType, {from: controller});
            const distribitionAfter = await distribution.getInfo();

            distribitionAfter[0].should.be.eq.BN(distribitionBefore[0].sub(toBN('1'))); // restAmount,
            distribitionAfter[1].should.be.eq.BN(distribitionBefore[1]);                // releasedAmount,
            distribitionAfter[2].should.be.eq.BN(distribitionBefore[2].add(toBN('1'))); // lastBlock,
            distribitionAfter[3].should.be.eq.BN(distribitionBefore[3]);                // INTERVAL_IN_BLOCKS,
            distribitionAfter[4].should.be.eq.BN(distribitionBefore[4]);                // NUMBER_OF_TYPES

            restAmount.should.be.eq.BN(distribitionAfter[0]);
            lastBlock.should.be.eq.BN(distribitionAfter[2]);

        })

        it('new egg created', async () => {

            const result = await coreController.claimEgg.call(sender, dragonType, {from: controller});
            [eggId, restAmount, lastBlock] = [result.eggId, result.restAmount, result.lastBlock];
            await coreController.claimEgg(sender, dragonType, {from: controller});
            const egg = await core.getEgg(eggId);
            [gen, coolness, parents, momTypes, dadTypes] = [egg[0], egg[1], egg[2], egg[3], egg[4]];

            gen.should.be.eq.BN('0');
            coolness.should.be.eq.BN('3600');
            parents[0].should.be.eq.BN('0');
            parents[1].should.be.eq.BN('0');
            momTypes[dragonType].should.be.eq.BN('100');
            dadTypes[dragonType].should.be.eq.BN('100');
        })

        it('gold taken', async () => {

            const senderBalanceBefore = await gold.balanceOf(sender);
            const treasuryBalanceBefore = await gold.balanceOf(treasury.address);

            const result = await coreController.claimEgg.call(sender, dragonType, {from: controller});
            [eggId, restAmount, lastBlock] = [result.eggId, result.restAmount, result.lastBlock];
            await coreController.claimEgg(sender, dragonType, {from: controller});

            const hatchingPrice = await treasury.hatchingPrice();
            const senderBalanceAfter = await gold.balanceOf(sender);
            const treasuryBalanceAfter = await gold.balanceOf(treasury.address);

            senderBalanceAfter.sub(hatchingPrice).should.be.eq.BN(senderBalanceBefore);
            treasuryBalanceAfter.add(hatchingPrice).should.be.eq.BN(treasuryBalanceBefore);

        })

        it('can be called by controller only', async () => {
            const error = await coreController.claimEgg(sender, dragonType, {from: accounts[9]}).should.be.rejected;
            error.reason.should.be.equal('no controller rights');
        })
    })

    describe('#sendToNest', async () => {
        const sender = [accounts[5], accounts[6], accounts[7]];
        const race = [0,1,2,3,4]
        const NUMBER_OF_EGG = 3

        beforeEach(async () => {
            eggIds = []
            for (let i = 0; i < NUMBER_OF_EGG; i++) {
                await mainBase.claimEgg(race[i % 5], {from: sender[i % 3]});
                eggIds.push(i+1);
            }
            //sendToNest transactions in coreController must be sent from the egg owner.
            //It is necessary for remoteApprove tokens.
            await upgradeController.returnOwnership(coreController.address);
            await coreController.setExternalDependencies(
                [
                    sender[0],
                    sender[1],
                    sender[2],
                    mainBase.address ], {from: owner});
            await coreController.transferOwnership(upgradeController.address);
        })

        it('add the egg into the empty nest', async () => {
            const result = await coreController.sendToNest.call(sender[0], eggIds[0], {from: sender[0]});
            [
                _isHatched,
                _newDragonId,
                _hatchedId,
                _owner
            ] = [result[0], result[1], result[2], result[3]];
            await coreController.sendToNest(sender[0], eggIds[0], {from: sender[0]} );
            _isHatched.should.be.equal(false);
            _newDragonId.should.be.eq.BN(0);
            _hatchedId.should.be.eq.BN(0);
            _owner.should.be.equal('0x0000000000000000000000000000000000000000');

        });

        it('add the egg in the nest with one egg', async () => {
            await mainBase.sendToNest(eggIds[0], {from: sender[0]});
            const result = await coreController.sendToNest.call(sender[1], eggIds[1], {from: sender[1]});
            [
                _isHatched,
                _newDragonId,
                _hatchedId,
                _owner
            ] = [result[0], result[1], result[2], result[3]];

            await coreController.sendToNest(sender[1], eggIds[1], {from: sender[1]} );
            _isHatched.should.be.equal(false);
            _newDragonId.should.be.eq.BN(0);
            _hatchedId.should.be.eq.BN(0);
            _owner.should.be.equal('0x0000000000000000000000000000000000000000');
        });

        it('add the egg in the nest with two eggs', async () => {
            await mainBase.sendToNest(eggIds[0], {from: sender[0]});
            await mainBase.sendToNest(eggIds[1], {from: sender[1]});

            const result = await coreController.sendToNest.call(sender[2], eggIds[2], {from: sender[2]});
            [
                _isHatched,
                _newDragonId,
                _hatchedId,
                _owner
            ] = [result[0], result[1], result[2], result[3]];

            await coreController.sendToNest(sender[2], eggIds[2], {from: sender[2]} );
            _isHatched.should.be.equal(true);
            _newDragonId.should.be.eq.BN(1);
            _hatchedId.should.be.eq.BN(1);
            _owner.should.be.equal(sender[0]);

        });

        it('send a non-existent egg', async () => {
            let nonExistentEgg = 5;
            let error = await coreController.sendToNest(sender[2], nonExistentEgg, {from: sender[2]}).should.be.rejected;
            //TODO fix error message
            error.reason.should.be.equal('invalid address');
        });

        it('re-sending eggs to the nest is not possible', async () => {
            await coreController.claimEgg(sender[1], race[3], {from: sender[1]});
            await mainBase.sendToNest(eggIds[0], {from: sender[0]});
            await mainBase.sendToNest(eggIds[1], {from: sender[1]});
            let error = await coreController.sendToNest(sender[1], eggIds[1], {from: sender[1]}).should.be.rejected;
            error.reason.should.be.equal('egg is already in nest');
        });

        it('send hatched egg to nest', async () => {
            await coreController.claimEgg(sender[0], race[3], {from: sender[0]});
            await mainBase.sendToNest(eggIds[0], {from: sender[0]});
            await mainBase.sendToNest(eggIds[1], {from: sender[1]});
            await mainBase.sendToNest(eggIds[2], {from: sender[2]});
            let error = await mainBase.sendToNest(eggIds[0], {from: sender[0]}).should.be.rejected;
            //TODO fix error message
            error.reason.should.be.equal('invalid address');
        });
    });
    describe('#Breed', async () => {
        const sender = accounts[5];
        const dragonTypes = [0,1,2,3,4]
        //set the required number of dragons
        const NUMBER_OF_DRAGON = 4
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
                if (i > 1)  dragonId.push(i - 1);
            }
            await dragonStorage.setLevel(dragonId[0], 1, 0, 10, {from: controller});
            await dragonStorage.setLevel(dragonId[1], 1, 0, 10, {from: controller});
        })
        it("new egg created", async () => {
            let expectedParents = [toBN(dragonId[0]), toBN(dragonId[1])];
            let newEgg = await coreController.breed.call(sender, dragonId[0], dragonId[1], {from: controller});
            await coreController.breed(sender, dragonId[0], dragonId[1], {from: controller});
            let egg = await getter.getEgg(newEgg);
            [
                gen,
                coolness,
                parents,
                momDragonTypes,
                dadDragonTypes
            ] = [egg.gen, egg.coolness, egg.parents, egg.momDragonTypes, egg.dadDragonTypes];
            gen.should.be.eq.BN(1);
            //TODO check coolness
            //How calculated?
            parents.should.be.deep.equal(expectedParents);
            //TODO check dragonType
        });

        it("mom and dad paid dna points", async () => {
            let dnaPoints = 10;
            let momDnaPointsBefore = (await dragonStorage.levels(dragonId[0])).dnaPoints;
            let dadDnaPointsBefore = (await dragonStorage.levels(dragonId[1])).dnaPoints;
            await coreController.breed(sender, dragonId[0], dragonId[1], {from: controller});
            let momDnaPointsAfter = (await dragonStorage.levels(dragonId[0])).dnaPoints;
            let dadDnaPointsAfter = (await dragonStorage.levels(dragonId[1])).dnaPoints;
            (new BN(momDnaPointsAfter)).add(toBN(dnaPoints)).should.be.eq.BN(momDnaPointsBefore);
            (new BN(dadDnaPointsAfter)).add(toBN(dnaPoints)).should.be.eq.BN(dadDnaPointsBefore);
        });
    })
});
