const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const UpgradeController = artifacts.require('UpgradeController.sol');
const CoreControllerV2 = artifacts.require('CoreControllerV2.sol');
const EggCore = artifacts.require('EggCore.sol');
const EggStorage = artifacts.require('EggStorage.sol');
const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;
const deployer = require('../scripts/deploy');
const {takeSnapshot,revertSnapshot, mineBlock} = require('../scripts/ganacheHelper.js');

contract('UpgradeController', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[1];
    const teamAccount = accounts[2];
    const userAccount = accounts[3];

    before(async () => {
        ({
            eggStorage, coreController,
            mainBase, upgradeController,
        } = await deployer(owner, teamAccount));

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result);
        snapshotId = await takeSnapshot();
    })

    describe('#migrate', async () => {

        it('upgrades contracts', async () => {
            const depsBefore =  await coreController.getInternalDependencies();
            const extsBefore =  await coreController.getExternalDependencies();

            const coreControllerV2 = await CoreControllerV2.new();
            await coreControllerV2.transferOwnership(upgradeController.address);
            await upgradeController.migrate(coreController.address, coreControllerV2.address);

            const depsAfter =  await coreController.getInternalDependencies();
            const extsAfter =  await coreController.getExternalDependencies();

            await mainBase.claimEgg(0, {from: userAccount});
            (await eggStorage.tokensOfOwner(userAccount))[0].should.be.eq.BN(1);

            await coreControllerV2.additionalFunctionality(3);
            (await coreControllerV2.additionalVariable()).should.be.eq.BN(3);

            depsBefore.should.be.deep.equal(depsAfter);
            extsBefore.should.be.deep.equal(extsAfter);
        })

        it('can be called by owner only', async () => {
            const error = await upgradeController.migrate(coreController.address,
                coreController.address, {from: accounts[9]}).should.be.rejected;
            error.reason.should.be.equal('not a contract owner');
        })
    })
})
