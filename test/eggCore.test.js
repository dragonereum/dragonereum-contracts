const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const EggCore = artifacts.require('EggCore.sol');
const EggStorage = artifacts.require('EggStorage.sol');
const {takeSnapshot,revertSnapshot} = require('../scripts/ganacheHelper.js');

const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

contract('EggCore', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const name = 'test';
    const symbol = 'TST';
    let eggStorageInstanse;
    let eggCoreInstance;
    const sender = accounts[2];
    const parents = [1337, 31337];
    const dragonType = 255;
    let snapshotId;
    before(async () => {
        eggStorageInstanse = await EggStorage.new(name, symbol);
        eggCoreInstance = await EggCore.new();
        await eggCoreInstance.setInternalDependencies([eggStorageInstanse.address], {from: owner});
        await eggCoreInstance.setExternalDependencies([controller], {from: owner});
        await eggStorageInstanse.setExternalDependencies([eggCoreInstance.address], {from: owner});
        snapshotId = await takeSnapshot();
    })
    afterEach(async () => {
      await revertSnapshot(snapshotId.result);
      snapshotId = await takeSnapshot();
    })

    describe('#constructor', async () => {
        it('all stuff initialized', async () => {
          (await eggCoreInstance.owner()).should.be.equal(owner);
          (await eggCoreInstance.getInternalDependencies())[0].should.be.equal(eggStorageInstanse.address);
          (await eggCoreInstance.getExternalDependencies())[0].should.be.equal(controller);
          (await eggStorageInstanse.getExternalDependencies())[0].should.be.equal(eggCoreInstance.address);
        })
    })

    describe('#create', async () => {
        it('created egg belongs to `sender`', async () => {
            (await eggCoreInstance.getAmount({from: controller})).should.be.eq.BN('0');
            (await eggCoreInstance.getAllEggs({from: controller})).length.should.be.equal(0);

            const id = await eggCoreInstance.create.call(sender, parents, dragonType, {from: controller});
            id.should.be.eq.BN('1');
            await eggCoreInstance.create(sender, parents, dragonType, {from: controller});

            (await eggCoreInstance.getAmount({from: controller})).should.be.eq.BN('1');
            (await eggCoreInstance.getAllEggs({from: controller})).length.should.be.equal(1);
            (await eggCoreInstance.ownerOf(id, {from: controller})).should.be.equal(sender);
            (await eggCoreInstance.isOwner(sender, id,  {from: controller})).should.be.equal(true);
            const egg = await eggCoreInstance.get(id, {from: controller});
            egg['0'][0].should.be.eq.BN(parents[0]);
            egg['0'][1].should.be.eq.BN(parents[1]);
            egg['1'].should.be.eq.BN(dragonType);
        })

        it('only controller can create egg', async () => {
            const error = await eggCoreInstance.create(sender, parents, dragonType, {from: accounts[3]}).should.be.rejected;
            error.reason.should.be.equal('no controller rights');
        })
    })

    describe('#remove', async () => {
        beforeEach(async () => {
            await eggCoreInstance.create(sender, parents, dragonType, {from: controller}); // id = 1
            await eggCoreInstance.create(accounts[3], [1,1], 1, {from: controller}); // id = 2
            await eggCoreInstance.create(accounts[4], [0,0], 2, {from: controller}); // id = 3
        })

        it('removed egg are actually removed', async () => {
            (await eggCoreInstance.getAmount({from: controller})).should.be.eq.BN('3');
            (await eggCoreInstance.getAllEggs({from: controller})).length.should.be.equal(3);

            await eggCoreInstance.remove(sender, 1, {from: controller});
            (await eggCoreInstance.getAllEggs({from: controller})).length.should.be.equal(2);

            // it should fail if you comletely remove egg from `eggs`
            await eggCoreInstance.get(1, {from: controller}).should.be.rejected;
        })

        it('only egg owner can remove it', async () => {
            const error = await eggCoreInstance.remove(sender, 2, {from: controller}).should.be.rejected;
            error.reason.should.be.equal('not an owner');
        })

        it('only controller call remove', async () => {
            const error = await await eggCoreInstance.remove(sender, 1, {from: accounts[5]}).should.be.rejected;
            error.reason.should.be.equal('no controller rights');
        })
    })
})
