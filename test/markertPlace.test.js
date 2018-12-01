const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;
const {takeSnapshot,revertSnapshot, mineBlock} = require('../scripts/ganacheHelper.js');
const FLAT_TYPE = 0;
const INCREASING_TYPE = 1;
const DUTCH_TYPE = 2;

contract('(Egg|Dragon|Skill)Marketplace', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const teamAccount = accounts[2];
    const userAccount = accounts[3];

    before(async () => {
        ({
            eggMarketplace, getter, marketplaceController, upgradeController,
        } = await deployer(owner, teamAccount));

        await upgradeController.returnOwnership(eggMarketplace.address);
        await eggMarketplace.setExternalDependencies([marketplaceController.address, getter.address, controller], {from: owner}).should.be.fulfilled;
        await eggMarketplace.transferOwnership(upgradeController.address);
        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
      await revertSnapshot(snapshotId.result);
      snapshotId = await takeSnapshot();
    })

    describe('#sellToken', async () => {

        it('should start flat auction', async () => {
            const forGOLD = true;
            const startPrice = toWei('1');
            const endPrice = toWei('1');
            const period = 1;
            const eggId = 3;

            const {receipt} = await eggMarketplace.sellToken(
                eggId, userAccount, startPrice, endPrice, period,
                forGOLD, {from: controller}
            );

            const eggsInSale = await eggMarketplace.tokensOfOwner(userAccount);
            const auction = await eggMarketplace.getAuction(eggsInSale[0]);
            const {timestamp} = await web3.eth.getBlock(receipt.blockNumber);

            auction[0].should.be.equal(userAccount);
            auction[1].should.be.eq.BN(startPrice);
            auction[2].should.be.eq.BN(startPrice);
            auction[3].should.be.eq.BN(startPrice);
            auction[4].should.be.eq.BN('1');
            auction[5].should.be.eq.BN(timestamp);
            auction[6].should.be.equal(forGOLD);
        })

        it('should start dutch auction', async () => {
            const forGOLD = true;
            const startPrice = toWei('2');
            const endPrice = toWei('1');
            const hourMultiplier = 60*60;
            const period = 100; // hours
            const waitTime = 9 * hourMultiplier;
            const eggId = 3;

            const {receipt} = await eggMarketplace.sellToken(
                eggId, userAccount, startPrice, endPrice, period,
                forGOLD, {from: controller}
            );
            let {timestamp} = await web3.eth.getBlock(receipt.blockNumber);
            await mineBlock(timestamp + waitTime);
            const eggsInSale = await eggMarketplace.tokensOfOwner(userAccount);
            const auction = await eggMarketplace.getAuction(eggsInSale[0]);

            const percent = toBN(waitTime).mul(toBN('100')).div(toBN(period * hourMultiplier));
            const percentOfPriceInterval = toBN(toBN(startPrice).sub(toBN(endPrice))).mul(percent).div(toBN('100'));

            auction[0].should.be.equal(userAccount);
            auction[1].should.be.eq.BN(toBN(startPrice).sub(percentOfPriceInterval)); // current
            auction[2].should.be.eq.BN(startPrice);
            auction[3].should.be.eq.BN(endPrice);
            auction[4].should.be.eq.BN(period);
            auction[5].should.be.eq.BN(timestamp);
            auction[6].should.be.equal(forGOLD);
        })

        it('should start increase auction', async () => {
            const forETH = false;
            const startPrice = toWei('1');
            const endPrice = toWei('2');
            const hourMultiplier = 60*60;
            const period = 100; // hours
            const waitTime = 19 * hourMultiplier;
            const eggId = 3;

            const {receipt} = await eggMarketplace.sellToken(
                eggId, userAccount, startPrice, endPrice, period,
                forETH, {from: controller}
            );
            let {timestamp} = await web3.eth.getBlock(receipt.blockNumber);
            await mineBlock(timestamp + waitTime);

            const eggsInSale = await eggMarketplace.tokensOfOwner(userAccount);
            const auction = await eggMarketplace.getAuction(eggsInSale[0]);
            const percent = toBN(waitTime).mul(toBN('100')).div(toBN(period * hourMultiplier));
            const percentOfPriceInterval = toBN(toBN(endPrice).sub(toBN(startPrice))).mul(percent).div(toBN('100'));

            auction[0].should.be.equal(userAccount);
            auction[1].should.be.eq.BN(toBN(startPrice).add(percentOfPriceInterval)); // current
            auction[2].should.be.eq.BN(startPrice);
            auction[3].should.be.eq.BN(endPrice);
            auction[4].should.be.eq.BN(period);
            auction[5].should.be.eq.BN(timestamp);
            auction[6].should.be.equal(forETH);
        })
    })

    describe('#buyToken', async () => {
        const forGOLD = true;
        const startPrice = toWei('2');
        const endPrice = toWei('3');
        const period = 100; // hours
        const eggId = 3;

        it('should validate isGold', async () => {
            await eggMarketplace.sellToken(
                eggId, userAccount, startPrice, endPrice, period, 
                forGOLD, {from: controller}
            );
            let balance = toWei('1000');
            let error = await eggMarketplace.buyToken(eggId, balance, startPrice, false, {from: controller}).should.be.rejected;
            error.reason.should.be.equal('wrong currency');
            await eggMarketplace.buyToken(eggId, balance, startPrice, true, {from: controller}).should.be.fulfilled;
            
        })
        it('should validate expected price', async () => {
            const expectedPrice = toWei('1');
            await eggMarketplace.sellToken(
                eggId, userAccount, startPrice, endPrice, period, 
                forGOLD, {from: controller}
            );
            let balance = toWei('1000');
            let error = await eggMarketplace.buyToken(eggId, balance, expectedPrice, true, {from: controller}).should.be.rejected;
            error.reason.should.be.equal('wrong price');
            await eggMarketplace.buyToken(eggId, balance, startPrice, true, {from: controller}).should.be.fulfilled;
        })
        it('auction should be removed after buying', async () => {
            await eggMarketplace.sellToken(
                eggId, userAccount, startPrice, endPrice, period, 
                forGOLD, {from: controller}
            );
            let balance = toWei('1000');
            await eggMarketplace.buyToken(eggId, balance, startPrice, true, {from: controller}).should.be.fulfilled;
            const auction = await eggMarketplace.getAuction(eggId);
            auction[0].should.be.equal('0x0000000000000000000000000000000000000000');
            auction[1].should.be.eq.BN(0); 
            auction[2].should.be.eq.BN(0); 
            auction[3].should.be.eq.BN(0);
            auction[4].should.be.eq.BN(0);
            auction[5].should.be.eq.BN(0);
            auction[6].should.be.equal(false);
        })
    })
})
