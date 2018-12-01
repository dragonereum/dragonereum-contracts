const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

const {takeSnapshot,revertSnapshot} = require('../scripts/ganacheHelper.js');


contract('Treasury', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const team = accounts[2];
    const HATCHING_PRICE = 1000;
    let snapshotId;

    before(async () => {
        ({ treasury, gold, upgradeController} = await deployer(owner, team));

        await upgradeController.returnOwnership(treasury.address);
        await treasury.setExternalDependencies([controller], {from: owner}).should.be.fulfilled;
        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
      await revertSnapshot(snapshotId.result);
      snapshotId = await takeSnapshot();
    })

    describe('#giveGold', async () => {
        const sender = accounts[5];

        it('gold is transferred to the user', async ()=> {
            let userBalanceBefore = await gold.balanceOf(sender);
            let amount = (new BN(HATCHING_PRICE)).mul((new BN(10)).pow(new BN(18)));
            await treasury.giveGold(sender, amount, {from: controller});
            let userBalanceAfter = await gold.balanceOf(sender);
            (new BN(userBalanceAfter)).sub(amount).should.be.eq.BN(userBalanceBefore);
        });
    })


    describe('#takeGold', async () => {
        const sender = accounts[5];

        it('gold is transferred to the treasury from user', async ()=> {
            let amount = (new BN(HATCHING_PRICE)).mul((new BN(10)).pow(new BN(18)));
            await treasury.giveGold(sender, amount, {from: controller});
            await treasury.setExternalDependencies([sender], {from: owner}).should.be.fulfilled;

            let userBalanceBefore = await gold.balanceOf(sender);
            let treasuryBalanceBefore = await gold.balanceOf(treasury.address);
            await treasury.takeGold(amount, {from: sender});
            let userBalanceAfter = await gold.balanceOf(sender);
            let treasuryBalanceAfter = await gold.balanceOf(treasury.address);


            (new BN(treasuryBalanceAfter)).sub(amount).should.be.eq.BN(treasuryBalanceBefore);
            (new BN(userBalanceAfter)).add(amount).should.be.eq.BN(userBalanceBefore);

        });
    })

})
