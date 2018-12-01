require('chai')
    .use(require('bn-chai')(web3.utils.BN))
    .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const Cheater = artifacts.require("Cheater.sol");
const GoldMock = artifacts.require("GoldMock.sol");
const {takeSnapshot,revertSnapshot, mineBlock} = require('../scripts/ganacheHelper.js');

const FLAT_TYPE = 0;
const INCREASING_TYPE = 1;
const DUTCH_TYPE = 2;

const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

contract('MainMarketTests', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const teamAccount = accounts[2];
    const userAccount = accounts[5];

    const GOLD_MULTIPLIER = (new BN(10)).pow(new BN(18));
    let snapshotId;
    before(async () => {
        ({
            treasury, eggStorage, dragonStorage, eggMarketplace,
            getter, marketplaceController, mainBase, events, mainMarket,
            gold, upgradeController, goldMarketplace, goldMarketplaceStorage,
            eggCore, core, dragonCore, skillMarketplace, dragonGetter, mainBattle,
        } = await deployer(owner, teamAccount));

        let goldMock = await GoldMock.new(treasury.address, {from: owner});
        await goldMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(gold.address, goldMock.address, {from: owner});

        await upgradeController.returnOwnership(dragonStorage.address);
        let dragonStorageExternalDependencies = await dragonStorage.getExternalDependencies();
        dragonStorageExternalDependencies.push(controller);
        await dragonStorage.setExternalDependencies(dragonStorageExternalDependencies, {from: owner}).should.be.fulfilled;
        await dragonStorage.transferOwnership(upgradeController.address);

        await upgradeController.returnOwnership(dragonCore.address);
        let dragonCoreExternalDependencies = await dragonCore.getExternalDependencies();
        dragonCoreExternalDependencies.push(controller);
        await dragonCore.setExternalDependencies(dragonCoreExternalDependencies, {from: owner}).should.be.fulfilled;
        await dragonCore.transferOwnership(upgradeController.address);

        await upgradeController.returnOwnership(core.address);
        let coreExternalDependencies = await core.getExternalDependencies();
        coreExternalDependencies.push(controller);
        await core.setExternalDependencies(coreExternalDependencies, {from: owner}).should.be.fulfilled;
        await core.transferOwnership(upgradeController.address);

        gold = goldMock;
        await gold.mint(teamAccount, toWei('10000000'));

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
      await revertSnapshot(snapshotId.result);
      snapshotId = await takeSnapshot();
    })

    async function amountEggsInNest() {
        let eggsInNest = await nest.getEggs();
        if (eggsInNest[0].eq(toBN(0))) {
            return 0;
        }
        if (!eggsInNest[0].eq(toBN(0)) && !eggsInNest[1].eq(toBN(0))) {
            return 2;
        }
        else return 1;
    }

    async function createDragons(numberOfDragons, owners) {
        const NUMBER_OF_DRAGON_TYPES = 5;
        let {releasedAmount, restAmount} = await getter.getDistributionInfo();
        let _index = releasedAmount.sub(restAmount);
        let currentType = _index.mod(toBN(NUMBER_OF_DRAGON_TYPES));
        const NUMBER_OF_OWNERS = owners.length;
        let eggs = await eggCore.getAmount();
        let dragons = await dragonGetter.getAmount();
        let dragonIds = []
        for (let i = 0; i < numberOfDragons + 2; i++) {
            await mainBase.claimEgg((currentType.add(toBN(i))).mod(toBN(NUMBER_OF_DRAGON_TYPES)), {from: owners[i % NUMBER_OF_OWNERS]});
        }
        for (let i = 1; i <= numberOfDragons + 2; i++) {
            let eggId = eggs.add(toBN(dragons)).add(toBN(i));
            let owner = await eggCore.ownerOf(eggId);
            let { receipt } = await mainBase.sendToNest(eggId, {from: owner});
            await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            if (eggId.gt(toBN(2))) {
                dragonIds.push(eggId.sub(toBN(2)));
            }
        }
        return dragonIds
    }

    describe('#createGoldSellOrder', async () => {
        it('should be added to marketplace', async () => {
            const price = new BN('100');
            const amount = new BN('10');

            const auctionsCount = await goldMarketplaceStorage.sellOrdersAmount();
            const sellerGoldBalanceBefore = await gold.balanceOf(teamAccount);

            const { receipt } = await mainMarket.createGoldSellOrder(price, amount, {from: teamAccount});

            const sellerGoldBalanceAfter = await gold.balanceOf(teamAccount);
            sellerGoldBalanceAfter.should.be.eq.BN(sellerGoldBalanceBefore.sub(amount));

            const auction = await goldMarketplaceStorage.orderOfSeller(teamAccount);

            auction.index.should.be.eq.BN(auctionsCount);
            auction.price.should.be.eq.BN(price);
            auction.amount.should.be.eq.BN(amount);
            auction.user.should.be.equal(teamAccount);

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('GoldSellOrderCreated');
            logs[0].args.seller.should.be.equal(teamAccount);
            logs[0].args.price.should.be.eq.BN(price);
            logs[0].args.amount.should.be.eq.BN(amount);
        })

        it('should reject if there is no GOLD', async () => {
            let error = await mainMarket.createGoldSellOrder(1, 1, {from: accounts[9]}).should.be.rejected;
            error.reason.should.be.equal('not enough tokens');
        })

        it('should reject with zero values', async () => {
            let error = await mainMarket.createGoldSellOrder(0, 10, {from: teamAccount}).should.be.rejected;
            error.reason.should.be.equal('price must be greater than 0');
            error = await mainMarket.createGoldSellOrder(10, 0, {from: teamAccount}).should.be.rejected;
            error.reason.should.be.equal('amount must be greater than 0');
        })

        it('onlyHuman check', async () => {
            const cheater = await Cheater.new(mainMarket.address, {from: owner});
            let error = await cheater.callCreateGoldSellOrder(10,10).should.be.rejected;
            error.reason.should.be.equal('not a human');
        })

        it("cannot be called when paused", async () => {
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({from: owner});
            const error = await mainMarket.createGoldSellOrder(1, 1, {from: teamAccount}).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })
    })

    describe('#fillGoldSellOrder', async () => {
        const price = toWei('0.1');
        const amount = toWei('1000');
        const buyer = accounts[5];
        const seller = teamAccount;
        beforeEach('set auction', async() => {
            await mainMarket.createGoldSellOrder(price, amount, {from: seller});
        })

        it('should be sold', async () => {
            const weis = toWei('1');
            const amount = new BN(toWei('10'));

            const auctionBefore = await goldMarketplaceStorage.orderOfSeller(seller);
            const sellerBalanceBefore = await web3.eth.getBalance(seller);
            const marketGoldBalanceBefore = await gold.balanceOf(goldMarketplaceStorage.address);

            const {
                receipt,
            } = await mainMarket.fillGoldSellOrder(seller, price, amount, {from: buyer, value: weis});

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('GoldSold');
            logs[0].args.buyer.should.be.equal(buyer);
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.amount.should.be.eq.BN(amount);
            logs[0].args.price.should.be.eq.BN(price);

            // move auction to marketPlaceController.test.js
            // TODO: check small numbers
            const auctionAfter = await goldMarketplaceStorage.orderOfSeller(seller);
            auctionAfter.index.should.be.eq.BN(auctionBefore.index);
            auctionAfter.price.should.be.eq.BN(price);
            auctionAfter.amount.should.be.eq.BN(auctionBefore.amount.sub(toBN(amount)));
            auctionAfter.user.should.be.equal(seller);

            const marketGoldBalanceAfter = await gold.balanceOf(goldMarketplaceStorage.address);
            marketGoldBalanceAfter.should.be.eq.BN(marketGoldBalanceBefore.sub(amount));

            const sellerBalanceAfter = await web3.eth.getBalance(seller);
            toBN(sellerBalanceAfter).should.be.eq.BN(toBN(sellerBalanceBefore).add(toBN(weis)));

            (await gold.balanceOf(buyer)).should.be.eq.BN(amount);
        })

        it('should return rest ETH', async () => {
            const weis = toWei('1');
            const amount = toWei('10');

            const buyerBalanceBefore = await web3.eth.getBalance(buyer);
            await mainMarket.fillGoldSellOrder(seller, price, amount, {from: buyer, value: weis, gasPrice: 0});
            const buyerBalanceAfter = await web3.eth.getBalance(buyer);

            const paidWei = toBN(amount).mul(toBN(price)).div(toBN(toWei('1')));
            toBN(buyerBalanceAfter).should.be.eq.BN(toBN(buyerBalanceBefore).sub(paidWei));

            (await gold.balanceOf(buyer)).should.be.eq.BN(amount);
        })

        it('should reject with zero amount', async () => {
            let error = await mainMarket.fillGoldSellOrder(seller, price, 0, {from: buyer, value: toBN('1')}).should.be.rejected;
            error.reason.should.be.equal('amount must be greater than 0');
        })

        it('onlyHuman check', async () => {
            const cheater = await Cheater.new(mainMarket.address, {from: owner});
            let error = await cheater.callFillGoldSellOrder(seller, price, 10).should.be.rejected;
            error.reason.should.be.equal('not a human');
        })

        it("cannot be called when paused", async () => {
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({from: owner});
            const error = await mainMarket.fillGoldSellOrder(seller, price, 10, {from: buyer, value: toBN('1')}).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })

        it('should reject when it\'s not enough ether', async () => {
            let error = await mainMarket.fillGoldSellOrder(seller, price, 10, {from: buyer, value: toBN('0')}).should.be.rejected;
            error.reason.should.be.equal('not enough ether');

            error = await mainMarket.fillGoldSellOrder(seller, price, toWei('10'), {from: buyer, value: toWei('0.001')}).should.be.rejected;
            error.reason.should.be.equal('not enough ether');
        })

        it('should reject when wrong expected price', async () => {
            const expectedPrice = (new BN(price)).sub(new BN(toWei('0.01')));
            let error = await mainMarket.fillGoldSellOrder(seller, expectedPrice, 10, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal('wrong actual price');
        })

        it('rounding checks SHOULD FAIL', async () => {
            const price = toWei('0.00001', 'ether');
            const amountForSale = toWei('1000', 'ether');
            const amountForBuy = toWei('8888', 'wei')
            await mainMarket.cancelGoldSellOrder({from: seller});
            await mainMarket.createGoldSellOrder(price, amountForSale, {from: seller});

            let error = await mainMarket.fillGoldSellOrder(seller, price, amountForBuy, {from: buyer, value: toBN('0')}).should.be.rejected;
            error.reason.should.be.equal('no free gold, sorry');
        })

        it('cannot buy if auction price/currency changed')
    })

    describe('#cancelGoldSellOrder', async () => {
        const price = toWei('0.1');
        const amount = toWei('1000');
        const buyer = accounts[5];
        const seller = teamAccount;
        beforeEach('set auction', async() => {
            await mainMarket.createGoldSellOrder(price, amount, {from: seller});
        })

        it('should be removed', async () => {
            const sellerGoldBalanceBefore = await gold.balanceOf(teamAccount);

            const auctionBefore = await goldMarketplaceStorage.orderOfSeller(seller);

            const {receipt} = await mainMarket.cancelGoldSellOrder({from: seller});

            await goldMarketplaceStorage.orderOfSeller(seller).should.be.rejected;

            const sellerGoldBalanceAfter = await gold.balanceOf(teamAccount);
            sellerGoldBalanceAfter.should.be.eq.BN(sellerGoldBalanceBefore.add(auctionBefore.amount));

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('GoldSellOrderCancelled');
            logs[0].args.seller.should.be.equal(seller);

            let error = await mainMarket.fillGoldSellOrder(seller, price, 10, {from: buyer, value: toBN('1')}).should.be.rejected;
            error.reason.should.be.equal('order does not exist');

            const allowanceAfter = await gold.allowance(seller, goldMarketplace.address);
            allowanceAfter.should.be.eq.BN('0');
        })

        it('onlyHuman check', async () => {
            const cheater = await Cheater.new(mainMarket.address, {from: owner});
            let error = await cheater.callCancelGoldSellOrder().should.be.rejected;
            error.reason.should.be.equal('not a human');
        })

        it("cannot be called when paused", async () => {
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({from: owner});
            const error = await mainMarket.cancelGoldSellOrder({from: seller}).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })

        it("cannot remove non-existent sale", async () => {
            const error = await mainMarket.cancelGoldSellOrder({from: accounts[9]}).should.be.rejected;
            error.reason.should.be.equal('order does not exist');
        })
    })

    describe('#createGoldBuyOrder', async () => {
        it('should be added to marketplace', async () => {
            const price = new BN(toWei('0.001'));
            const amount = new BN(toWei('100'));
            const value = price.mul(amount).div(GOLD_MULTIPLIER);

            const ordersAmount = await goldMarketplaceStorage.buyOrdersAmount();
            const { receipt } = await mainMarket.createGoldBuyOrder(price, amount, { from: teamAccount, value });
            const order = await goldMarketplaceStorage.orderOfBuyer(teamAccount);

            order.index.should.be.eq.BN(ordersAmount);
            order.price.should.be.eq.BN(price);
            order.amount.should.be.eq.BN(amount);
            order.user.should.be.equal(teamAccount);

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('GoldBuyOrderCreated');
            logs[0].args.buyer.should.be.equal(teamAccount);
            logs[0].args.price.should.be.eq.BN(price);
            logs[0].args.amount.should.be.eq.BN(amount);
        })

        it('should reject if wrong eth value (less than necessary)', async () => {
            const price = new BN(toWei('0.001'));
            const amount = new BN(toWei('100'));
            const value = price.mul(amount).div(GOLD_MULTIPLIER).sub(new BN(1));
            let error = await mainMarket.createGoldBuyOrder(price, amount, {from: teamAccount, value}).should.be.rejected;
            error.reason.should.be.equal('wrong eth value');
        })

        it('should reject if wrong eth value (more than necessary)', async () => {
            const price = new BN(toWei('0.001'));
            const amount = new BN(toWei('100'));
            const value = price.mul(amount).div(GOLD_MULTIPLIER).add(new BN(1));
            let error = await mainMarket.createGoldBuyOrder(price, amount, {from: teamAccount, value}).should.be.rejected;
            error.reason.should.be.equal('wrong eth value');
        })

        it('should reject with zero values', async () => {
            let price = new BN(toWei('0'));
            let amount = new BN(toWei('100'));
            let value = price.mul(amount).div(GOLD_MULTIPLIER);
            let error = await mainMarket.createGoldBuyOrder(price, amount, { from: teamAccount, value }).should.be.rejected;
            error.reason.should.be.equal('price must be greater than 0');
            price = new BN(toWei('0.001'));
            amount = new BN(toWei('0'));
            value = price.mul(amount).div(GOLD_MULTIPLIER);
            error = await mainMarket.createGoldBuyOrder(price, amount, { from: teamAccount, value }).should.be.rejected;
            error.reason.should.be.equal('amount must be greater than 0');
        })

        it("cannot be called when paused", async () => {
            const price = new BN(toWei('0.001'));
            const amount = new BN(toWei('100'));
            const value = price.mul(amount).div(GOLD_MULTIPLIER);
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({from: owner});
            const error = await mainMarket.createGoldBuyOrder(price, amount, { from: teamAccount, value }).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })
    })

    describe('#fillGoldBuyOrder', async () => {
        const price = new BN(toWei('0.001'));
        const buyer = accounts[5];
        const seller = teamAccount;
        beforeEach('set auction', async() => {
            const amount = new BN(toWei('1000'));
            const value = price.mul(amount).div(GOLD_MULTIPLIER);
            await mainMarket.createGoldBuyOrder(price, amount, { from: buyer, value });
        })

        it('should be bought', async () => {
            const amount = new BN(toWei('100'));
            const value = price.mul(amount).div(GOLD_MULTIPLIER);

            const gasPrice = new BN(toWei('1', 'gwei'));

            const orderBefore = await goldMarketplaceStorage.orderOfBuyer(buyer);
            const marketplaceBalanceBefore = new BN(await web3.eth.getBalance(goldMarketplaceStorage.address));
            const sellerBalanceBefore = new BN(await web3.eth.getBalance(seller));
            const marketplaceGoldBalanceBefore = new BN(await gold.balanceOf(seller));
            const buyerGoldBalanceBefore = new BN(await gold.balanceOf(buyer));
            const { receipt } = await mainMarket.fillGoldBuyOrder(buyer, price, amount, { from: seller, gasPrice });

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('GoldBought');
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.buyer.should.be.equal(buyer);
            logs[0].args.amount.should.be.eq.BN(amount);
            logs[0].args.price.should.be.eq.BN(price);

            const orderAfter = await goldMarketplaceStorage.orderOfBuyer(buyer);
            orderAfter.index.should.be.eq.BN(orderBefore.index);
            orderAfter.price.should.be.eq.BN(price);
            orderAfter.amount.should.be.eq.BN(orderBefore.amount.sub(amount));
            orderAfter.user.should.be.equal(buyer);

            const marketplaceBalanceAfter = new BN(await web3.eth.getBalance(goldMarketplaceStorage.address));
            const sellerBalanceAfter= new BN(await web3.eth.getBalance(seller));
            const burnedEth = gasPrice.mul(new BN(receipt.gasUsed));
            marketplaceBalanceAfter.should.be.eq.BN(marketplaceBalanceBefore.sub(value));
            sellerBalanceAfter.should.be.eq.BN(sellerBalanceBefore.sub(burnedEth).add(value));

            const marketplaceGoldBalanceAfter = new BN(await gold.balanceOf(seller));
            const buyerGoldBalanceAfter = new BN(await gold.balanceOf(buyer));
            marketplaceGoldBalanceAfter.should.be.eq.BN(marketplaceGoldBalanceBefore.sub(amount));
            buyerGoldBalanceAfter.should.be.eq.BN(buyerGoldBalanceBefore.add(amount));
        })

        it('should reject with zero amount', async () => {
            const amount = new BN(toWei('0'));
            const error = await mainMarket.fillGoldBuyOrder(buyer, price, amount, { from: seller }).should.be.rejected;
            error.reason.should.be.equal('amount must be greater than 0');
        })

        it("cannot be called when paused", async () => {
            const amount = new BN(toWei('10'));
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({ from: owner });
            const error = await mainMarket.fillGoldBuyOrder(buyer, price, amount, { from: seller }).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })

        it('should reject when it\'s not enough gold', async () => {
            const amount = new BN(toWei('10'));
            const error = await mainMarket.fillGoldBuyOrder(buyer, price, amount, { from: accounts[9] }).should.be.rejected;
            error.reason.should.be.equal('not enough tokens');
        })

        it('should reject when wrong expected price', async () => {
            const expectedPrice = (new BN(price)).sub(new BN(toWei('0.01')));
            let error = await mainMarket.fillGoldBuyOrder(buyer, expectedPrice, 10, {from: seller}).should.be.rejected;
            error.reason.should.be.equal('wrong actual price');
        })

        // TODO: add test when someone buys the whole auction
    })

    describe('#cancelGoldBuyOrder', async () => {
        const price = new BN(toWei('0.001'));
        const gasPrice = new BN(toWei('1', 'gwei'));
        const buyer = accounts[5];
        const seller = teamAccount;
        beforeEach('set auction', async() => {
            const amount = new BN(toWei('1000'));
            const value = price.mul(amount).div(GOLD_MULTIPLIER);
            await mainMarket.createGoldBuyOrder(price, amount, { from: buyer, value, gasPrice });
        })

        it('should be removed', async () => {
            const order = await goldMarketplaceStorage.orderOfBuyer(buyer);
            const value = order.price.mul(order.amount).div(GOLD_MULTIPLIER);

            const marketplaceBalanceBefore = new BN(await web3.eth.getBalance(goldMarketplaceStorage.address));
            const buyerBalanceBefore = new BN(await web3.eth.getBalance(buyer));

            const { receipt } = await mainMarket.cancelGoldBuyOrder({ from: buyer, gasPrice });

            await goldMarketplaceStorage.orderOfBuyer(buyer).should.be.rejected;

            const amount = new BN(toWei('10'));
            const error = await mainMarket.fillGoldBuyOrder(buyer, price, amount, { from: seller }).should.be.rejected;
            error.reason.should.be.equal('order does not exist');

            const marketplaceBalanceAfter = new BN(await web3.eth.getBalance(goldMarketplaceStorage.address));
            const buyerBalanceAfter = new BN(await web3.eth.getBalance(buyer));
            const burnedEth = gasPrice.mul(new BN(receipt.gasUsed));
            marketplaceBalanceAfter.should.be.eq.BN(marketplaceBalanceBefore.sub(value));
            buyerBalanceAfter.should.be.eq.BN(buyerBalanceBefore.sub(burnedEth).add(value));
        })

        it("cannot be called when paused", async () => {
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({ from: owner });
            const error = await mainMarket.cancelGoldBuyOrder({ from: buyer }).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })
    })

    describe('#sellEgg', async () => {

        beforeEach('claim egg', async() => {
            await mainBase.claimEgg(0, {from: userAccount});
            await mainBase.claimEgg(1, {from: userAccount});
            await mainBase.claimEgg(2, {from: userAccount});
        })

        it('should start flat auction', async () => {
            const eggs = await eggStorage.tokensOfOwner(userAccount);
            const forGOLD = true;
            const maxPrice = toWei('1');
            const minPrice = toWei('1');
            const period = 1;

            const {receipt} = await mainMarket.sellEgg(eggs[2], maxPrice, minPrice, period, forGOLD, {from: userAccount});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('EggOnSale');
            logs[0].args.seller.should.be.equal(userAccount);
            logs[0].args.id.should.be.eq.BN(eggs[2]);
        })

        it('should start dutch auction', async () => {
            const eggs = await eggStorage.tokensOfOwner(userAccount);
            const forGOLD = true;
            const startPrice = toWei('2');
            const endPrice = toWei('1');
            const period = 100; // hours

            const {receipt} = await mainMarket.sellEgg(eggs[2], startPrice, endPrice, period, forGOLD, {from: userAccount});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('EggOnSale');
            logs[0].args.seller.should.be.equal(userAccount);
            logs[0].args.id.should.be.eq.BN(eggs[2]);
        })

        it('should start increase auction', async () => {
            const eggs = await eggStorage.tokensOfOwner(userAccount);
            const forETH = false;
            const startPrice = toWei('1');
            const endPrice = toWei('2');
            const period = 100; // hours

            const {receipt} = await mainMarket.sellEgg(eggs[2], startPrice, endPrice, period, forETH, {from: userAccount});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('EggOnSale');
            logs[0].args.seller.should.be.equal(userAccount);
            logs[0].args.id.should.be.eq.BN(eggs[2]);
        })

        it('seller can reinstall auction', async () => {
            const eggs = await eggStorage.tokensOfOwner(userAccount);
            const forETH = false;
            const forGOLD = true;
            const startPrice = toWei('1');
            const endPrice = toWei('2');
            const period = 100; // hours

            await mainMarket.sellEgg(eggs[2], startPrice, endPrice, period, forETH, {from: userAccount});
            const auctionBefore = await eggMarketplace.getAuction(eggs[2]);
            await mainMarket.sellEgg(eggs[2], startPrice*2, endPrice*2, period, forGOLD, {from: userAccount});
            const auctionAfter = await eggMarketplace.getAuction(eggs[2]);

            auctionBefore[2].should.be.eq.BN(startPrice);
            auctionBefore[3].should.be.eq.BN(endPrice);
            auctionBefore[6].should.be.equal(forETH);

            auctionAfter[2].should.be.eq.BN(toBN(startPrice).mul(toBN('2')));
            auctionAfter[3].should.be.eq.BN(toBN(endPrice).mul(toBN('2')));
            auctionAfter[6].should.be.equal(forGOLD);
        })

        it('onlyHuman check', async () => {
            const cheater = await Cheater.new(mainMarket.address, {from: owner});
            let error = await cheater.callSellEgg().should.be.rejected;
            error.reason.should.be.equal('not a human');
        })

        it("cannot be called when paused", async () => {
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({from: owner});
            const error = await mainMarket.sellEgg(1, 2, 1, 1, true, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })

        it("cannot sell foreign egg", async () => {
            const otherUser = accounts[9];
            await mainBase.claimEgg(3, {from: otherUser});
            const eggs = await eggStorage.tokensOfOwner(otherUser);
            const error = await mainMarket.sellEgg(eggs[0], 20, 10, 1, false, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('not an owner')
        })

        it('cannot be sold if egg in nest', async () => {
            const eggs = await eggStorage.tokensOfOwner(userAccount);
            await mainBase.sendToNest(eggs[2], {from: userAccount});
            const error = await mainMarket.sellEgg(eggs[2], 20, 10, 1, false, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('egg is in nest');
        })

        it('cannot sell hatched egg')

        it('cannot sell already sold egg', async () => {
            const eggs = await eggStorage.tokensOfOwner(userAccount);
            const forETH = false;
            const maxPrice = toWei('1');
            const minPrice = toWei('1');
            const period = 1;
            const buyer = accounts[6];
            const seller = userAccount;

            await mainMarket.sellEgg(eggs[2], maxPrice, minPrice, period, forETH, {from: seller});
            await mainMarket.buyEgg(eggs[2], maxPrice, forETH, {from: buyer, value: toWei('1')});
            const error = await mainMarket.sellEgg(eggs[2], maxPrice, minPrice, period, forETH, {from: seller}).should.be.rejected;
            error.reason.should.be.equal('not an owner');
        })
    })

    describe('#buyEgg', async () => {
        const price = toWei('1');
        const forETH = false;
        const buyer = accounts[6];
        const seller = userAccount;
        let eggForSale = 10;
        beforeEach('claim egg', async() => {
            await mainBase.claimEgg(0, {from: seller});
            await mainBase.claimEgg(1, {from: seller});
            await mainBase.claimEgg(2, {from: seller});
            const eggs = await eggStorage.tokensOfOwner(seller);
            eggForSale = eggs[2];
            await mainMarket.sellEgg(eggForSale, price, price, 0, forETH, {from: seller});
        })

        it('should be bought for ETH', async () => {
            const eggs = await eggStorage.tokensOfOwner(seller);
            const sellerBalanceBefore = await web3.eth.getBalance(seller);
            const {receipt} = await mainMarket.buyEgg(eggForSale, price, forETH, {from: buyer, value: toWei('1')});

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('EggBought');
            logs[0].args.buyer.should.be.equal(buyer);
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(eggForSale);
            logs[0].args.price.should.be.eq.BN(price);

            const sellerBalanceAfter = await web3.eth.getBalance(seller);
            toBN(sellerBalanceAfter).should.be.eq.BN(toBN(sellerBalanceBefore).add(toBN(price)));
            (await eggStorage.tokensOfOwner(buyer))[0].should.be.eq.BN(eggForSale);
            (await eggStorage.tokensOfOwner(seller)).length.should.be.equal(eggs.length - 1);
        })

        it('should be bought for GOLD', async () => {
            const forGOLD = true;
            const buyer = teamAccount;
            const eggs = await eggStorage.tokensOfOwner(seller);
            const eggForSale = eggs[1];
            await mainMarket.sellEgg(eggForSale, price, price, 0, forGOLD, {from: seller});

            const sellerBalanceBefore = await gold.balanceOf(seller);
            const {receipt} = await mainMarket.buyEgg(eggForSale, price, forGOLD, {from: buyer});

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('EggBought');
            logs[0].args.buyer.should.be.equal(buyer);
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(eggForSale);
            logs[0].args.price.should.be.eq.BN(price);

            const sellerBalanceAfter = await gold.balanceOf(seller);
            toBN(sellerBalanceAfter).should.be.eq.BN(toBN(sellerBalanceBefore).add(toBN(price)));
            (await eggStorage.tokensOfOwner(buyer))[0].should.be.eq.BN(eggForSale);
            (await eggStorage.tokensOfOwner(seller)).length.should.be.equal(eggs.length - 1);
        })

        it('onlyHuman check', async () => {
            const cheater = await Cheater.new(mainMarket.address, {from: owner});
            let error = await cheater.callBuyEgg().should.be.rejected;
            error.reason.should.be.equal('not a human');
        })

        it("cannot be called when paused", async () => {
            await upgradeController.returnOwnership(mainMarket.address);
            await mainMarket.pause({from: owner});
            const error = await mainMarket.buyEgg(1, price, forETH, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal('contract is paused');
        })

        it('should reject when it\'s not enough ether', async () => {
            const weis = price / 2;
            const error = await mainMarket.buyEgg(eggForSale, price, forETH, {from: buyer, value: weis}).should.be.rejected;
            error.reason.should.be.equal('not enough ether/gold');
        })

        it('should reject when it\'s not enough GOLD', async () => {
            const forGOLD = true;
            const buyer = accounts[9];
            gold.transfer(buyer, price/2, {from: teamAccount});
            const eggs = await eggStorage.tokensOfOwner(seller);
            const eggForSale = eggs[1];
            await mainMarket.sellEgg(eggForSale, price, price, 0, forGOLD, {from: seller});
            const error = await mainMarket.buyEgg(eggForSale, price, forGOLD, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal('not enough ether/gold');
        })

        it('cannot buy if egg is not in sale', async () => {
            const eggs = await eggStorage.tokensOfOwner(seller);
            const error = await mainMarket.buyEgg(eggs[0], price, forETH, {from: buyer, value: toWei('1')}).should.be.rejected;
            error.reason.should.be.equal('token is not on sale');
        })

        it('cannot buy if egg was sold', async () => {
            await mainMarket.buyEgg(eggForSale, price, forETH, {from: buyer, value: toWei('1')})
            const error = await mainMarket.buyEgg(eggForSale, price, forETH, {from: buyer, value: toWei('1')}).should.be.rejected;
            error.reason.should.be.equal('token is not on sale');
        })

        it('auction should be removed if egg disappeared', async () => {
            const eggs = await eggStorage.tokensOfOwner(seller);
            const buyerBalanceBefore = await web3.eth.getBalance(buyer);
            await eggStorage.transferFrom(seller, accounts[9], eggForSale, {from: seller});
            const {receipt} = await mainMarket.buyEgg(eggForSale, price, forETH, {from: buyer, value: toWei('1'), gasPrice: 0});

            (await eggStorage.tokensOfOwner(seller)).length.should.be.equal(eggs.length - 1);
            (await eggStorage.tokensOfOwner(accounts[9]))[0].should.be.eq.BN(eggForSale);
            (await eggStorage.tokensOfOwner(buyer)).should.be.deep.equal([]);

            const auction = await eggMarketplace.getAuction(eggForSale);

            auction[0].should.be.equal('0x0000000000000000000000000000000000000000');
            const tokens = await eggMarketplace.getAllTokens();
            tokens.should.be.deep.equal([]);

            const buyerBalanceAfter = await web3.eth.getBalance(buyer);
            toBN(buyerBalanceAfter).should.be.eq.BN(toBN(buyerBalanceBefore));

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('EggRemovedFromSale');
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(eggForSale);
        })
    })

    describe('#removeEggFromSale', async () => {
        const price = toWei('1');
        const forETH = false;
        const buyer = accounts[6];
        const seller = userAccount;
        let eggForSale = 10;
        beforeEach('claim egg', async() => {
            await mainBase.claimEgg(0, {from: seller});
            await mainBase.claimEgg(1, {from: seller});
            await mainBase.claimEgg(2, {from: seller});
            const eggs = await eggStorage.tokensOfOwner(seller);
            eggForSale = eggs[2];
            await mainMarket.sellEgg(eggForSale, price, price, 0, forETH, {from: seller});
        })

        it('should be removed', async () => {
            const {receipt} = await mainMarket.removeEggFromSale(eggForSale, {from: seller});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('EggRemovedFromSale');
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(eggForSale);

            const eggsInSale = await eggMarketplace.tokensOfOwner(seller);
            eggsInSale.should.be.deep.equal([]);
            const auction = await eggMarketplace.getAuction(eggForSale);
            auction[0].should.be.equal('0x0000000000000000000000000000000000000000');
            const tokens = await eggMarketplace.getAllTokens();
            tokens.should.be.deep.equal([]);
        })

        it('cannot remove foreign egg', async () => {
            const error = await mainMarket.removeEggFromSale(eggForSale, {from: accounts[9]}).should.be.rejected;
            error.reason.should.be.equal('not an owner');
        })

        it('cannot remove if egg is not in sale', async () => {
            const eggs = await eggStorage.tokensOfOwner(seller);
            const error = await mainMarket.removeEggFromSale(eggs[1], {from: seller}).should.be.rejected;
            error.reason.should.be.equal('token is not on sale');
        })

    })

    describe('#sellDragon', async () => {
        const dragonTypes = [0,1,2,3,4];
        const NUMBER_OF_DRAGON = 1;
        let eggs = [];
        beforeEach('claim egg', async() => {
            for (let i = 0; i < NUMBER_OF_DRAGON + 2; i++) {
                await mainBase.claimEgg(dragonTypes[i % 5], {from: userAccount});
            }
            eggs = await eggStorage.tokensOfOwner(userAccount);
            for (let i = 0; i < eggs.length; i++) {
                await mainBase.sendToNest(eggs[i], {from: userAccount});
            }
        })

        it('should create auction', async () => {
            const dragons = await dragonStorage.tokensOfOwner(userAccount);
            const forGOLD = true;
            const maxPrice = toWei('1');
            const minPrice = toWei('1');
            const period = 1;

            const {receipt} = await mainMarket.sellDragon(dragons[0], maxPrice, minPrice, period, forGOLD, {from: userAccount});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('DragonOnSale');
            logs[0].args.seller.should.be.equal(userAccount);
            logs[0].args.id.should.be.eq.BN(dragons[0]);
        })
    })

    describe('#buyDragon', async () => {
        const forETH = false;
        const maxPrice = toBN(toWei('1'));
        const minPrice = toBN(toWei('1'));
        const period = 1;
        const seller = accounts[8];
        const buyer = accounts[9];
        let dragonIDs;

        beforeEach(async () => {
            dragonIDs = await createDragons(2, [seller, buyer]);
            await mainMarket.sellDragon(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: seller});
        })

        it('should work', async() => {
            const sellerBalanceBefore = await web3.eth.getBalance(seller);
            const {receipt} = await mainMarket.buyDragon(dragonIDs[0], minPrice, forETH, {from: buyer, value: maxPrice});

            const sellerBalanceAfter = await web3.eth.getBalance(seller);
            toBN(sellerBalanceAfter).sub(maxPrice).should.be.eq.BN(sellerBalanceBefore);

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('DragonBought');
            logs[0].args.buyer.should.be.equal(buyer);
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(dragonIDs[0]);
            logs[0].args.price.should.be.eq.BN(maxPrice);
        })
    })

    describe('#sellBreeding', async() => {
        const forETH = false;
        const maxPrice = toWei('1');
        const minPrice = toWei('1');
        const period = 1;
        const seller = accounts[8];
        const buyer = accounts[9];
        let dragonIDs;

        beforeEach(async () => {
            dragonIDs = await createDragons(2, [seller, buyer]);
        })

        it('should work', async () => {
            await dragonStorage.setLevel(dragonIDs[0], 1, 100, 10, {from: controller});
            const {receipt} = await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: seller});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('DragonOnBreeding');
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(dragonIDs[0]);
        })

        it('cannot sell if there is no DNA points', async() => {
            const error = await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: seller}).should.be.rejected;
            error.reason.should.be.equal('dragon has no enough DNA points for breeding');
        })

        it('should be owner of dragon', async () => {
            await dragonStorage.setLevel(dragonIDs[0], 1, 100, 10, {from: controller});
            const error = await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: accounts[3]}).should.be.rejected;
            error.reason.should.be.equal('not an owner');
        })

        it('cannot sell if dragon in battle', async () => {
            await dragonStorage.setLevel(dragonIDs[0], 1, 100, 10, {from: controller});
            await mainBattle.createGladiatorBattle(dragonIDs[0], [50,50], false, toWei('1'), 5, {from: seller, value: toWei('1')});
            const error = await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: seller}).should.be.rejected;
            error.reason.should.be.equal('dragon participates in gladiator battle');
        })

        it('cannot sell if dragon in sale', async () => {
            await dragonStorage.setLevel(dragonIDs[0], 1, 100, 10, {from: controller});
            await mainMarket.sellDragon(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: seller});

            const error = await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: seller}).should.be.rejected;
            error.reason.should.be.equal('dragon is on sale');
        })
    })

    describe('#buyBreeding', async () => {
        const forETH = false;
        const maxPrice = toBN(toWei('1'));
        const minPrice = toBN(toWei('1'));
        const period = 1;
        const seller = accounts[8];
        const buyer = accounts[9];
        let dragonIDs;

        beforeEach(async () => {
            dragonIDs = await createDragons(2, [seller, buyer]);
            await dragonStorage.setLevel(dragonIDs[0], 1, 100, 10, {from: controller});
            await dragonStorage.setLevel(dragonIDs[1], 1, 100, 10, {from: controller});
            await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forETH, {from: seller});
        })

        it('should work', async() => {
            const sellerBalanceBefore = await web3.eth.getBalance(seller);
            const sellerDNAPointsBefore = await getter.getDragonProfile(dragonIDs[1]);
            const buyerDNAPointsBefore = await getter.getDragonProfile(dragonIDs[0]);
            let eggAmount = await eggCore.getAmount();
            const {receipt} = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[0], minPrice, forETH, {from: buyer, value: minPrice});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            const sellerBalanceAfter = await web3.eth.getBalance(seller);
            const sellerDNAPointsAfter = await getter.getDragonProfile(dragonIDs[1]);
            const buyerDNAPointsAfter = await getter.getDragonProfile(dragonIDs[0]);

            toBN(sellerBalanceAfter).sub(minPrice).should.be.eq.BN(sellerBalanceBefore);
            sellerDNAPointsBefore.dnaPoints.sub(toBN(10)).should.be.eq.BN(sellerDNAPointsAfter.dnaPoints);
            buyerDNAPointsBefore.dnaPoints.sub(toBN(10)).should.be.eq.BN(buyerDNAPointsAfter.dnaPoints);

            eggAmount = await eggCore.getAmount();
            logs[0].event.should.be.equal('EggCreated');
            logs[0].args.user.should.be.equal(buyer);
            logs[0].args.id.should.be.eq.BN(eggAmount.add(toBN(dragonIDs.length))); // they count from 1. And 2 eggs alredy hatched

            logs[1].event.should.be.equal('DragonBreedingBought');
            logs[1].args.seller.should.be.equal(seller);
            logs[1].args.buyer.should.be.equal(buyer);
            logs[1].args.id.should.be.eq.BN(dragonIDs[0]);
            logs[1].args.price.should.be.eq.BN(minPrice);
        })

        it('cannot breed the same dragon', async () => {
            const error = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[1], minPrice, forETH, {from: seller, value: minPrice}).should.be.rejected;
            error.reason.should.be.equal('the same dragon');
        })

        it('cannot buy if there is no DNA points', async() => {
            await dragonStorage.setLevel(dragonIDs[1], 1, 100, 3, {from: controller});
            const error = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[0], minPrice, forETH, {from: buyer, value: minPrice}).should.be.rejected;
            error.reason.should.be.equal('dragon has no enough DNA points for breeding');
        })

        it('cannot breed if not an owner', async() => {
            const error = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[0], minPrice, forETH, {from: accounts[7], value: minPrice}).should.be.rejected;
            error.reason.should.be.equal('not an owner');
        })

        it('not enough ETH', async() => {
            const error = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[0], minPrice, forETH, {from: buyer, value: minPrice.div(toBN(2))}).should.be.rejected;
            error.reason.should.be.equal('not enough ether/gold');
        })

        it('not enough GOLD', async () => {
            const forGOLD = true;
            gold.transfer(buyer, maxPrice.div(toBN(2)), {from: teamAccount});
            await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forGOLD, {from: seller});

            const error = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[0], minPrice, forGOLD, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal('not enough ether/gold');
        })

        it('cannot breed if there is no such auction', async() => {
            const dragon = (await createDragons(1, [accounts[6]]))[0];
            await dragonStorage.setLevel(dragon, 1, 100, 10, {from: controller});
            const error = await mainMarket.buyBreeding(dragonIDs[1], dragon, minPrice, forETH, {from: buyer, value: minPrice}).should.be.rejected;
            error.reason.should.be.equal('token is not on sale');
        })

        it('should return ETH if trade fails', async () => {
            await dragonStorage.transferFrom(seller, accounts[0], dragonIDs[0], {from: seller});
            const buyerBalanceBefore = await web3.eth.getBalance(buyer);
            const {receipt} = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[0], minPrice, forETH, {from: buyer, value: minPrice, gasPrice: 0});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('DragonRemovedFromBreeding');
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(dragonIDs[0]);

            const buyerBalanceAfter = await web3.eth.getBalance(buyer);
            toBN(buyerBalanceBefore).should.be.eq.BN(buyerBalanceAfter);
        })

        it('should return GOLD if trade fails', async () => {
            const forGOLD = true;
            await mainMarket.sellBreeding(dragonIDs[0], maxPrice, minPrice, period, forGOLD, {from: seller});
            await dragonStorage.transferFrom(seller, accounts[0], dragonIDs[0], {from: seller});
            gold.transfer(buyer, maxPrice, {from: teamAccount});

            const buyerBalanceBefore = await gold.balanceOf(buyer);
            const {receipt} = await mainMarket.buyBreeding(dragonIDs[1], dragonIDs[0], minPrice, forGOLD, {from: buyer, gasPrice: 0});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('DragonRemovedFromBreeding');
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(dragonIDs[0]);

            const buyerBalanceAfter = await gold.balanceOf(buyer);
            buyerBalanceBefore.should.be.eq.BN(buyerBalanceAfter);
        })
    })


    describe('#sellSkill', async () => {
        const dragonTypes = [0,1,2,3,4];
        const NUMBER_OF_DRAGON = 2;
        let eggs = [];
        beforeEach('create dragons', async() => {
            for (let i = 0; i < NUMBER_OF_DRAGON + 2; i++) {
                await mainBase.claimEgg(dragonTypes[i % 5], {from: userAccount});
            }
            eggs = await eggStorage.tokensOfOwner(userAccount);
            for (let i = 0; i < eggs.length; i++) {
                await mainBase.sendToNest(eggs[i], {from: userAccount});
            }
        })

        async function setSpecialPeacefulSkill(sender, dragon, skillId) {
            await dragonStorage.setLevel(dragon, 10, 0, 0, {from: controller});
            return await mainBase.setDragonSpecialPeacefulSkill(dragon, skillId, {from: sender});
        }

        it('cannot sell the skill if it is not installed', async () => {
            const dragons = await dragonStorage.tokensOfOwner(userAccount);
            let dragon = dragons[0];
            await mainMarket.sellSkill(dragon, 1).should.be.rejected;
            const error =  await mainMarket.sellSkill(dragons[0], 1, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal("special peaceful skill is not yet set");
        })
        it('cannot sell the skill if price equal 0', async () => {
            const dragons = await dragonStorage.tokensOfOwner(userAccount);
            let dragon = dragons[0];
            await setSpecialPeacefulSkill(userAccount, dragon, 1);
            let price = 0;
            const error =  await mainMarket.sellSkill(dragon, price, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal("price must be more than 0");
            price = 1;
            await mainMarket.sellSkill(dragon, price, {from: userAccount}).should.be.fulfilled;
        })

        it('should create auction', async () => {
            const dragons = await dragonStorage.tokensOfOwner(userAccount);
            let dragon = dragons[0];
            await setSpecialPeacefulSkill(userAccount, dragon, 1);
            let priceExpected = 1;

            const {receipt} = await mainMarket.sellSkill(dragon, priceExpected, {from: userAccount});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('SkillOnSale');
            logs[0].args.seller.should.be.equal(userAccount);
            logs[0].args.id.should.be.eq.BN(dragons[0]);

            let priceActual = await skillMarketplace.getAuction(dragon);
            priceActual.should.be.eq.BN(priceExpected);
        })

        it("cannot sell foreign skill", async () => {
            const otherUser = accounts[9];
            const dragons = await dragonStorage.tokensOfOwner(userAccount);
            let dragon = dragons[0];
            let price = 1;
            await setSpecialPeacefulSkill(userAccount, dragon, 1);
            const error = await mainMarket.sellSkill(dragon, price, {from: otherUser}).should.be.rejected;
            error.reason.should.be.equal('not an owner')
        })

        it('cannot sell if a dragon participates of the gladiator battle', async () => {
            const otherUser = accounts[9];
            const dragons = await dragonStorage.tokensOfOwner(userAccount);
            let dragon = dragons[0];
            let price = 1;
            const _isGold = false;
            const _bet = toWei('1');
            const _counter = toBN(5);
            const _tactics = [toBN(25), toBN(25)];
            await setSpecialPeacefulSkill(userAccount, dragon, 1);
            await mainBattle.createGladiatorBattle(dragon, _tactics, _isGold, _bet, _counter, {from: userAccount, value: toWei('1')});
            const error = await mainMarket.sellSkill(dragon, price, {from: userAccount}).should.be.rejected;
            error.reason.should.be.equal('dragon participates in gladiator battle')
        })
    })



    describe('#buySkill', async () => {
        const price = toWei('1');
        const buyer = teamAccount;
        const seller = userAccount;

        beforeEach('create dragon, set skill and create auction', async() => {
            await createDragons(2, [seller, buyer])
            const dragons = await dragonStorage.tokensOfOwner(seller);
            let dragon = dragons[0];
            let skillId = 2;
            await dragonStorage.setLevel(dragon, 10, 0, 0, {from: controller});
            await mainBase.setDragonSpecialPeacefulSkill(dragon, skillId, {from: seller})
            await mainMarket.sellSkill(dragon, price, {from: seller});
        })
        it('buy skill', async () => {
            let buyerDragons = await dragonStorage.tokensOfOwner(buyer);
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let buyerDragon = buyerDragons[0];
            let sellerDragon = sellerDragons[0];

            const sellerBalanceBefore = await gold.balanceOf(seller);
            const dragonSpecialSkill = await getter.getDragonSpecialPeacefulSkill(sellerDragon);
            const effect = dragonSpecialSkill.effect;
            const {receipt} = await mainMarket.buySkill(
                sellerDragon,
                buyerDragon,
                price,
                dragonSpecialSkill.effect,
                {from: buyer}
            ).should.be.fulfilled;

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});

            logs[0].event.should.be.equal('SkillBought');
            logs[0].args.buyer.should.be.equal(buyer);
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(sellerDragon);
            logs[0].args.target.should.be.eq.BN(buyerDragon);
            logs[0].args.price.should.be.eq.BN(price);

            const sellerBalanceAfter = await gold.balanceOf(seller);
            toBN(sellerBalanceAfter).should.be.eq.BN(toBN(sellerBalanceBefore).add(toBN(price)));
            const dragonBuffs = await dragonGetter.getBuffs(buyerDragon);
            const buff = dragonBuffs[1];
            buff.should.be.eq.BN(effect);
        })
        it('cannot buy a skill from his own dragon', async () => {
            let buyerDragons = await dragonStorage.tokensOfOwner(buyer);
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let buyerDragon = buyerDragons[0];
            let sellerDragon = sellerDragons[0];
            const { effect } = await getter.getDragonSpecialPeacefulSkill(sellerDragon);
            const error = await mainMarket.buySkill(sellerDragon, buyerDragon, price, effect, {from: seller}).should.be.rejected;
            error.reason.should.be.equal("seller can't be buyer");
        })
        it('cannot buy for a participant of the gladiator battle', async () => {
            let buyerDragons = await dragonStorage.tokensOfOwner(buyer);
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let buyerDragon = buyerDragons[0];
            let sellerDragon = sellerDragons[0];
            const _tactics = [toBN(25), toBN(25)];
            const _isGold = false;
            const _bet = toWei('1');
            const _counter = toBN(5);
            await mainBattle.createGladiatorBattle(buyerDragon, _tactics, _isGold, _bet, _counter, {from: buyer, value: toWei('1')});
            const { effect } = await getter.getDragonSpecialPeacefulSkill(sellerDragon);
            const error = await mainMarket.buySkill(sellerDragon, buyerDragon, price, effect, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal("dragon participates in gladiator battle");
        })

        it('cannot buy if a sellerDragons participates of the gladiator battle', async () => {
            let buyerDragons = await dragonStorage.tokensOfOwner(buyer);
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let buyerDragon = buyerDragons[0];
            let sellerDragon = sellerDragons[0];
            const _tactics = [toBN(25), toBN(25)];
            const _isGold = false;
            const _bet = toWei('1');
            const _counter = toBN(5);
            await mainBattle.createGladiatorBattle(sellerDragon, _tactics, _isGold, _bet, _counter, {from: seller, value: toWei('1')});
            const { effect } = await getter.getDragonSpecialPeacefulSkill(sellerDragon);
            const error = await mainMarket.buySkill(sellerDragon, buyerDragon, price, effect, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal("dragon participates in gladiator battle");
        })

        it('cannot buy if expected price changed', async () => {
            let buyerDragons = await dragonStorage.tokensOfOwner(buyer);
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let buyerDragon = buyerDragons[0];
            let sellerDragon = sellerDragons[0];
            let newPrice = toWei('7');
            await mainMarket.sellSkill(sellerDragon, newPrice, {from: seller});
            const { effect } = await getter.getDragonSpecialPeacefulSkill(sellerDragon);
            const error = await mainMarket.buySkill(sellerDragon, buyerDragon, price, effect, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal("wrong price");
            await mainMarket.buySkill(sellerDragon, buyerDragon, newPrice, effect, {from: buyer}).should.be.fulfilled;
        })

        it('cannot buy if expected effect changed', async () => {
            let buyerDragons = await dragonStorage.tokensOfOwner(buyer);
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let buyerDragon = buyerDragons[0];
            let sellerDragon = sellerDragons[0];
            let newPrice = toWei('7');
            let skillId = 2;
            await dragonStorage.setLevel(buyerDragon, 10, 0, 0, {from: controller});
            await mainBase.setDragonSpecialPeacefulSkill(buyerDragon, skillId, {from: buyer});
            await mainBase.useDragonSpecialPeacefulSkill(buyerDragon, sellerDragon, {from: buyer});
            let { effect } = await getter.getDragonSpecialPeacefulSkill(sellerDragon);
            await core.resetDragonBuffs(sellerDragon, {from: controller});
            const error = await mainMarket.buySkill(sellerDragon, buyerDragon, price, effect, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal("effect decreased");
            let skill = await getter.getDragonSpecialPeacefulSkill(sellerDragon);
            await mainMarket.buySkill(sellerDragon, buyerDragon, newPrice, skill.effect, {from: buyer}).should.be.fulfilled;
        })
    })

    describe('#removeSkillFromSale', async () => {
        const price = toWei('1');
        const buyer = teamAccount;
        const seller = userAccount;

        beforeEach('create dragon, set skill and create auction', async() => {
            await createDragons(2, [seller, buyer])
            const dragons = await dragonStorage.tokensOfOwner(userAccount);
            let dragon = dragons[0];
            let skillId = 1;
            await dragonStorage.setLevel(dragon, 10, 0, 0, {from: controller});
            await mainBase.setDragonSpecialPeacefulSkill(dragon, skillId, {from: seller})
            await mainMarket.sellSkill(dragon, price, {from: seller});
        })

        it('should be removed', async () => {
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let sellerDragon = sellerDragons[0];

            const {receipt} = await mainMarket.removeSkillFromSale(sellerDragon, {from: seller});
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('SkillRemovedFromSale');
            logs[0].args.seller.should.be.equal(seller);
            logs[0].args.id.should.be.eq.BN(sellerDragon);

            await skillMarketplace.getAuction(sellerDragon).should.be.rejected;
            const tokens = await skillMarketplace.getAllTokens();
            tokens.should.be.deep.equal([]);
        })

        it('cannot remove foreign skill', async () => {
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let sellerDragon = sellerDragons[0];
            let notOwner = teamAccount;
            const error = await mainMarket.removeSkillFromSale(sellerDragon, {from: notOwner}).should.be.rejected;
            error.reason.should.be.equal('not an owner');
        })

        it('cannot remove if skill is not in sale', async () => {
            let buyerDragons = await dragonStorage.tokensOfOwner(buyer);
            let buyerDragon = buyerDragons[0];
            const error = await mainMarket.removeSkillFromSale(buyerDragon, {from: buyer}).should.be.rejected;
            error.reason.should.be.equal('skill is not on sale');
        })


        it('the removal of the auction when several auctions', async () => {
            let users = [accounts[6], accounts[7], accounts[8]]
            let skillId = 1;
            let sellerDragons = await dragonStorage.tokensOfOwner(seller);
            let sellerDragon = sellerDragons[0];

            let expectedAuctions = [sellerDragon];
            await createDragons(6, users);
            for (let i = 0; i < users.length; i++) {
                let dragons = await dragonStorage.tokensOfOwner(users[i]);
                for (let j = 0; j < dragons.length; j++) {
                    let dragon = dragons[j];
                    await dragonStorage.setLevel(dragon, 10, 0, 0, {from: controller});
                    await mainBase.setDragonSpecialPeacefulSkill(dragon, skillId, {from: users[i]})
                    await mainMarket.sellSkill(dragon, (new BN(price)).add(toBN(1)), {from: users[i]});
                    expectedAuctions.push(dragon);
                }
            }

            let actualAuctions = await skillMarketplace.getAllTokens();

            actualAuctions.should.be.deep.eq.BN(expectedAuctions);

            await mainMarket.removeSkillFromSale(sellerDragon, {from: seller}).should.be.fulfilled;
            expectedAuctions[0] = expectedAuctions[expectedAuctions.length - 1];
            expectedAuctions.splice(expectedAuctions.length - 1, 1);
            actualAuctions = await skillMarketplace.getAllTokens();
            actualAuctions.should.be.deep.eq.BN(expectedAuctions);
        })
    })
})
