const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const {takeSnapshot,revertSnapshot, mineBlock, minerStart, minerStop} = require('../scripts/ganacheHelper.js');

const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

contract('DragonLeaderboard', async (accounts) => {
    const owner = accounts[0];
    const teamAccount = accounts[1];
    const controller = accounts[2];

    before(async () => {
        ({ upgradeController, dragonLeaderboard } = await deployer(owner, teamAccount));

        await upgradeController.returnOwnership(dragonLeaderboard.address, {from: owner});
        let exts = await dragonLeaderboard.getExternalDependencies();
        exts.push(controller);
        await dragonLeaderboard.setExternalDependencies(exts, {from: owner});
        await dragonLeaderboard.transferOwnership(upgradeController.address, {from: owner});

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result);
        snapshotId = await takeSnapshot();
    })

    describe('#update', async () => {
        const coolness = [3700, 3701, 3702, 3703, 3704, 3705, 3706, 3707, 3708, 3709];

        beforeEach(async()=> {
            for(i = 0; i < 10; i++) {
                await dragonLeaderboard.update(i+2, coolness[i], {from: controller});
            }
        })

        it('should work', async () => {
            const positions = await dragonLeaderboard.getDragonsFromLeaderboard();

            for(i = positions.length - 1; i < 0; i--) {
                positions[i].should.be.eq.BN(toBN(i+2));
            }
        })

        it('top 5 uped to the 3 place', async () => {
            await dragonLeaderboard.update(5+2, coolness[7], {from: controller});
            const positions = await dragonLeaderboard.getDragonsFromLeaderboard();

            positions[0].should.be.eq.BN(9 + 2);
            positions[1].should.be.eq.BN(8 + 2);
            positions[2].should.be.eq.BN(7 + 2);
            positions[3].should.be.eq.BN(5 + 2);
            positions[4].should.be.eq.BN(6 + 2);
            positions[5].should.be.eq.BN(4 + 2);
            positions[6].should.be.eq.BN(3 + 2);
            positions[7].should.be.eq.BN(2 + 2);
            positions[8].should.be.eq.BN(1 + 2);
            positions[9].should.be.eq.BN(0 + 2);
        })

        it('add new top 5', async () => {
            await dragonLeaderboard.update(11+2, coolness[6], {from: controller});
            const positions = await dragonLeaderboard.getDragonsFromLeaderboard();

            positions[0].should.be.eq.BN(9 + 2);
            positions[1].should.be.eq.BN(8 + 2);
            positions[2].should.be.eq.BN(7 + 2);
            positions[3].should.be.eq.BN(6 + 2);
            positions[4].should.be.eq.BN(11 + 2);
            positions[5].should.be.eq.BN(5 + 2);
            positions[6].should.be.eq.BN(4 + 2);
            positions[7].should.be.eq.BN(3 + 2);
            positions[8].should.be.eq.BN(2 + 2);
            positions[9].should.be.eq.BN(1 + 2);
        })
    })
})
