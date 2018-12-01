const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

const {takeSnapshot,revertSnapshot} = require('../scripts/ganacheHelper.js');

contract('Core', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const team = accounts[2];

    before(async () => {
        ({
            dragonGetter, nest, core, getter,
            marketplaceController, coreController,
            battleController, mainBase, upgradeController,
        } = await deployer(owner, team));

        await upgradeController.returnOwnership(core.address);

        await core.setExternalDependencies([
            controller,
            coreController.address,
            battleController.address,
            getter.address,
            marketplaceController.address
         ], {from: owner}).should.be.fulfilled;
        await core.transferOwnership(upgradeController.address);
        await upgradeController.returnOwnership(nest.address);
        await nest.setExternalDependencies([
            controller,
            core.address,
            getter.address,
        ], {from: owner}).should.be.fulfilled;
        await nest.transferOwnership(upgradeController.address);

        // distribution = await Distribution.new({from: owner});

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
      await revertSnapshot(snapshotId.result);
      snapshotId = await takeSnapshot();
    })

    describe('#sendToNest', async () => {
        const senders = [accounts[5], accounts[6], accounts[7]];
        const race = [0,1,2,3,4]
        const NUMBER_OF_EGG = 3
        sender = accounts[5];

        beforeEach("create eggs", async () => {
            eggIds = []
            for (let i = 0; i < NUMBER_OF_EGG; i++) {
                await mainBase.claimEgg(race[i % 5], {from: senders[i % 3]});
                eggIds.push(i+1);
            }
        })

        it('sent the egg to the nest.', async () => {
            let result = await core.sendToNest.call(eggIds[0], {from: controller});
            [
                _isIncubated,
                _newDragonId,
                _incubatedId,
                _owner
            ] = [result.isIncubated, result.newDragonId, result.incubatedId, result.owner];
            await core.sendToNest(eggIds[0], {from: controller});
            (await getter.isEggInNest(eggIds[0])).should.be.equal(true);
        })

        it('after sending two eggs to the nest, both eggs are there', async () => {
            let expectedEggInIncibator = []
            for (let i = 0; i < 2; i++) {
                await core.sendToNest(eggIds[i], {from: controller});
                (await getter.isEggInNest(eggIds[i])).should.be.equal(true);
                expectedEggInIncibator.push(toBN(eggIds[i]));
            }
            (await getter.getEggsInNest()).should.be.deep.equal(expectedEggInIncibator);
        })

        it('after sending the third egg to the nest, the first leaves the nest.', async () => {
            for (let i = 0; i <= 2; i++) {
                await core.sendToNest(eggIds[i], {from: controller});
                (await getter.isEggInNest(eggIds[i])).should.be.equal(true);
                if (i > 1)
                {
                    (await getter.isEggInNest(eggIds[0])).should.be.equal(false);
                }
            }
        })
    })

    describe('#Create new dragon from genesis eggs', async () => {
        const senders = [accounts[5], accounts[6], accounts[7]];
        const race = [0,1,2,3,4]
        const NUMBER_OF_EGG = 5
        const NUMBER_OF_SENDERS = senders.length;
        sender = accounts[5];

        beforeEach("create eggs", async () => {
            eggIds = []
            for (let i = 0; i < NUMBER_OF_EGG; i++) {
                await mainBase.claimEgg(race[i % 5], {from: senders[i % 3]});
                eggIds.push(i+1);
            }
            for (let i = 0; i < 2; i++) {
                await mainBase.sendToNest(eggIds[i], {from: senders[i % NUMBER_OF_SENDERS]});
                if (i > 1)  dragonId.push(i - 1);
            }
        })

        it("check owner, generation, parents and dragonTypes of new dragon", async() => {
            let result = await core.sendToNest.call(eggIds[2], {from: controller});
            [
                _isIncubated,
                _newDragonId,
                _incubatedId,
                _owner
            ] = [result.isIncubated, result.newDragonId, result.incubatedId, result.owner];
            await mainBase.sendToNest(eggIds[2], {from: senders[2]});
            (await dragonGetter.ownerOf(_newDragonId)).should.be.equal(senders[0]);
            (await dragonGetter.getGeneration(_newDragonId)).should.be.eq.BN(0);
            let parents = [toBN(0),toBN(0)];
            (await dragonGetter.getParents(_newDragonId)).should.be.deep.equal(parents);
            let dragonTypes = await dragonGetter.getDragonTypes(_newDragonId);
            (dragonTypes[race[0]]).should.be.eq.BN(40);
        });
    })
})
