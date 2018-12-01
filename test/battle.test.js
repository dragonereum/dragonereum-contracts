const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();
const { assert } = require('chai');

const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;
const deployer = require('../scripts/deploy');
const {takeSnapshot,revertSnapshot, mineBlock} = require('../scripts/ganacheHelper.js');
const BattleMock = artifacts.require("BattleMock.sol");

contract('BattleController', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const teamAccount = accounts[2];
    const userAccount = accounts[3];
    const dragonTypes = [0,1,2,3,4];
    const senders = [accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]];

    before(async () => {
        ({ battle, upgradeController } = await deployer(owner, teamAccount));

        const battleMock = await BattleMock.new({from: owner});
        await battleMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(battle.address, battleMock.address, {from: owner});

        await upgradeController.returnOwnership(battleMock.address, {from: owner});
        let exts = await battleMock.getExternalDependencies();
        exts.push(controller);
        await battleMock.setExternalDependencies(exts, {from: owner});
        await battleMock.transferOwnership(upgradeController.address, {from: owner});
        battle = battleMock;

        // for (let i = 0; i < senders.length + 2; i++) {
        //     await mainBase.claimEgg(dragonTypes[i % dragonTypes.length], {from: senders[i % senders.length]});
        //     let eggs = await eggStorage.tokensOfOwner(senders[i % senders.length]);
        //     await mainBase.sendToNest(eggs[0], {from: senders[i % senders.length]});
        // }

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result);
        snapshotId = await takeSnapshot();
    })

    describe('#calculateDragonTypeMultiply', async () => {
        it('calculates right values', async () => {
            // 0,10,0,30,0,0,0,0,0,0,0
            // 18,22,0,0,0,0,0,0,0,0,0
            // 0,22,0,0,18,0,0,0,0,0,0
            // 24,0,0,0,16,0,0,0,0,0,0
            // 0, 9,22,9,0,0,0,0,0,0,0
            // 0,16,0,24,0,0,0,0,0,0,0
            // water, fire, air, earth, cyber
            let attackerTypesArray = [40, 0, 0, 0, 0,  0,0,0,0,0,0];
            let defenderTypesArray = [ 0, 0, 0, 0, 0,  0,0,0,0,0,0];
            for(i=0; i<5; i++) {
                let tempDefender = defenderTypesArray.slice();
                tempDefender[i] = 40;
                let attackMyltiplier = await battle.calculateDragonTypeMultiply(attackerTypesArray, tempDefender);
                if(i % 2 === 0) {
                    attackMyltiplier.should.be.eq.BN(1600);
                } else {
                    attackMyltiplier.should.be.eq.BN(2400);
                }
            }

            attackerTypesArray = [0,  0, 40, 0, 0,  0,0,0,0,0,0];
            defenderTypesArray = [10, 10, 10, 10, 0,  0,0,0,0,0,0];
            attackMyltiplier = await battle.calculateDragonTypeMultiply(attackerTypesArray, defenderTypesArray);
            attackMyltiplier.should.be.eq.BN((40 * 10 + 40 * 10)/2 + 1600);

            attackerTypesArray = [9,  0, 11, 0, 20,  0,0,0,0,0,0];
            defenderTypesArray = [10, 10, 10, 10, 0,  0,0,0,0,0,0];
            attackMyltiply = await battle.calculateDragonTypeMultiply(attackerTypesArray, defenderTypesArray);
            attackMyltiply.should.be.eq.BN(((9*10+9*10) + (11*10+11*10) + (20*10+20*10))/2 + 1600);
        })
    })
})
