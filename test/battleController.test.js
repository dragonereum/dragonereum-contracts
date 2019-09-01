const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();
const { assert } = require('chai');

const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;
const deployer = require('../scripts/deploy');
const {takeSnapshot,revertSnapshot, mineBlock} = require('../scripts/ganacheHelper.js');
const BattleControllerMock = artifacts.require("BattleControllerMock.sol");
const GetterMock = artifacts.require("GetterMock.sol");

contract('BattleController', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const teamAccount = accounts[2];
    const userAccount = accounts[3];
    const dragonTypes = [0,1,2,3,4];
    const senders = [accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]];

    before(async () => {
        ({
            treasury, eggStorage, dragonStorage,
            getter, battleController, mainBase,
            gold, upgradeController,
        } = await deployer(owner, teamAccount));

        const getterMock = await GetterMock.new({from: owner});
        await getterMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(getter.address, getterMock.address, {from: owner});
        getter = getterMock;

        const battleControllerMock = await BattleControllerMock.new({from: owner});
        await battleControllerMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(battleController.address, battleControllerMock.address, {from: owner});

        await upgradeController.returnOwnership(battleControllerMock.address, {from: owner});
        let exts = await battleControllerMock.getExternalDependencies();
        exts.push(controller);
        await battleControllerMock.setExternalDependencies(exts, {from: owner});
        await battleControllerMock.transferOwnership(upgradeController.address, {from: owner});
        battleController = battleControllerMock;

        await upgradeController.returnOwnership(treasury.address, {from: owner});
        exts = await treasury.getExternalDependencies();
        exts.push(controller);
        await treasury.setExternalDependencies(exts, {from: owner});
        await treasury.transferOwnership(upgradeController.address, {from: owner});

        for (let i = 0; i < senders.length + 2; i++) {
            await mainBase.claimEgg(dragonTypes[i % dragonTypes.length], {from: senders[i % senders.length]});
            let eggs = await eggStorage.tokensOfOwner(senders[i % senders.length]);
            await mainBase.sendToNest(eggs[0], {from: senders[i % senders.length]});
        }

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result);
        snapshotId = await takeSnapshot();
    })

    describe('#startBattle', async () => {

        it('rewards and XP should be paid', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];

            const firstDragonGoldBefore = await gold.balanceOf(senders[0]);
            const secondDragonGoldBefore = await gold.balanceOf(senders[1]);
            const firstDragonBattlesBefore = await getter.getDragonBattles(myDragons[0]);
            const secondDragonBattlesBefore = await getter.getDragonBattles(yourDragons[0]);
            const firstDragonProfileBefore = await getter.getDragonProfile(myDragons[0]);
            const secondDragonProfileBefore = await getter.getDragonProfile(yourDragons[0]);

            await battleController.startBattle(senders[0], myDragons[0], yourDragons[0], tactics, { from: controller });

            const firstDragonBattlesAfter = await getter.getDragonBattles(myDragons[0]);
            const secondDragonBattlesAfter = await getter.getDragonBattles(yourDragons[0]);

            const firstBefore = firstDragonBattlesBefore.wins.add(firstDragonBattlesBefore.defeats);
            const secondBefore = secondDragonBattlesBefore.wins.add(secondDragonBattlesBefore.defeats);
            const firstAfter = firstDragonBattlesAfter.wins.add(firstDragonBattlesAfter.defeats);
            const secondAfter = secondDragonBattlesAfter.wins.add(secondDragonBattlesAfter.defeats);

            firstBefore.should.be.eq.BN(firstAfter.sub(toBN('1')));
            secondBefore.should.be.eq.BN(secondAfter.sub(toBN('1')));

            const secondDragonProfileAfter = await getter.getDragonProfile(yourDragons[0]);
            const firstDragonProfileAfter = await getter.getDragonProfile(myDragons[0]);
            const firstDragonGoldAfter = await gold.balanceOf(senders[0]);
            const secondDragonGoldAfter = await gold.balanceOf(senders[1]);
            if(firstDragonBattlesBefore.wins.lt(firstDragonBattlesAfter.wins)) {
                firstDragonProfileAfter.experience.should.be.gt.BN(firstDragonProfileBefore.experience);
                secondDragonProfileAfter.experience.should.be.eq.BN(secondDragonProfileBefore.experience);
                // at this battle first player is attacker, so he should get reward in case of win
                firstDragonGoldAfter.should.be.gt.BN(firstDragonGoldBefore);
                secondDragonGoldAfter.should.be.eq.BN(secondDragonGoldBefore);
            } else if (secondDragonBattlesBefore.wins.lt(secondDragonBattlesAfter.wins)) {
                secondDragonProfileAfter.experience.should.be.gt.BN(secondDragonProfileBefore.experience);
                firstDragonProfileAfter.experience.should.be.eq.BN(firstDragonProfileBefore.experience);
                // at this battle first player is attacker, so he shouldn't get reward in case of defeat
                firstDragonGoldAfter.should.be.eq.BN(firstDragonGoldBefore);
                // opponent doesnot get reward in any case
                secondDragonGoldAfter.should.be.eq.BN(secondDragonGoldBefore);
            } else {
                assert.fail('something goes wrong');
            }
        })

        it('opponent should be untouchable after battle', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];

            await battleController.startBattle(senders[0], myDragons[0], yourDragons[0], tactics, { from: controller });
            (await battleController.isTouchable(yourDragons[0])).should.be.equal(false);
            (await battleController.isTouchable(myDragons[0])).should.be.equal(true);
        })

    })

    describe('#calculateExperience', async() => {
        it('depends on strength', async() => {
            let attackerFactor = 10;
            let isAttackerWinner = true;
            let attackerStrength = 9736;
            let opponentStrength = 11074;
            let xpFactor = await battleController.calculateExperience(isAttackerWinner, attackerStrength, opponentStrength);
            xpFactor.should.be.gt.BN(attackerFactor);

            attackerFactor = 5;
            isAttackerWinner = false;
            attackerStrength = 9736;
            opponentStrength = 11074;
            xpFactor = await battleController.calculateExperience(isAttackerWinner, attackerStrength, opponentStrength);
            xpFactor.should.be.lt.BN(attackerFactor);

            attackerFactor = 10;
            isAttackerWinner = true;
            attackerStrength = 9736;
            opponentStrength = 9736;
            xpFactor = await battleController.calculateExperience(isAttackerWinner, attackerStrength, opponentStrength);
            xpFactor.should.be.eq.BN(attackerFactor);

            attackerFactor = 10;
            isAttackerWinner = true;
            attackerStrength = 9737;
            opponentStrength = 9736;
            xpFactor = await battleController.calculateExperience(isAttackerWinner, attackerStrength, opponentStrength);
            xpFactor.should.be.lt.BN(attackerFactor);

            attackerFactor = 5;
            isAttackerWinner = false;
            attackerStrength = 9736;
            opponentStrength = 9736;
            xpFactor = await battleController.calculateExperience(isAttackerWinner, attackerStrength, opponentStrength);
            xpFactor.should.be.eq.BN(attackerFactor);

            attackerFactor = 5;
            isAttackerWinner = false;
            attackerStrength = 19736;
            opponentStrength = 9736;
            xpFactor = await battleController.calculateExperience(isAttackerWinner, attackerStrength, opponentStrength);
            xpFactor.should.be.eq.BN(10);
        })
    })

    describe('#payGoldReward', async() => {
        it('should reward 200 at the begining (winner is weaker)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 9736;
            let looserStrength = 11074;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(100);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.should.be.eq.BN(balanceBefore.add(toBN(toWei('200'))));
        })

        it('should reward 200 at the begining (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(100);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.should.be.eq.BN(balanceBefore.add(toBN(toWei('200'))));
        })

        it('should reward no more than 200 if count of dragons is less than 3000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(2000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('200'));
        })

        it('should reward no more than 100 if count of dragons is more than 3000 but less than 6000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(5000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('100'));
        })

        it('should reward no more than 50 if count of dragons is more than 6000 but less than 9000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(8000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('50'));
        })

        it('should reward no more than 25 if count of dragons is more than 9000 but less than 12000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(10000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('25'));
        })

        it('should reward no more than 12.5 if count of dragons is more than 12000 but less than 15000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(14000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('12.5'));
        })

        it('should reward no more than 6.25 if count of dragons is more than 15000 but less than 18000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(17000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('6.25'));
        })

        it('should reward no more than 3.125 if count of dragons is more than 18000 but less than 21000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(20000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('3.125'));
        })

        it('should reward no more than 1.5625 if count of dragons is more than 21000 (winner is stronger)', async() => {
            const sender = senders[0];
            const dragonId = (await dragonStorage.tokensOfOwner(senders[0]))[0];
            const balanceBefore = await gold.balanceOf(sender);
            let winnerStrength = 11074;
            let looserStrength = 9000;
            let winFactor = await battleController.calculateGoldRewardFactor(winnerStrength, looserStrength);
            await getter.setDragonsAmount(25000);
            await battleController.payGoldReward(sender, dragonId, winFactor);

            const balanceAfter = await gold.balanceOf(sender);
            balanceAfter.sub(balanceBefore).should.be.not.gt.BN(toWei('1.5625'));
        })
    })
})
