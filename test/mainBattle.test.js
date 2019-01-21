require('chai')
    .use(require('bn-chai')(web3.utils.BN))
    .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const Cheater = artifacts.require("Cheater.sol");
const RandomMock = artifacts.require("RandomMock.sol");
const GoldMock = artifacts.require("GoldMock.sol");
const GladiatorBattleMock = artifacts.require("GladiatorBattleMock.sol");
const {takeSnapshot,revertSnapshot, mineBlock} = require('../scripts/ganacheHelper.js');

const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;

const EXTENSION_TIME_START_PRICE = toWei('50');
const AUTO_SELECT_TIME = toBN(6000);

contract('MainBattleTests', async (accounts) => {
    const owner = accounts[0];
    const controller = accounts[0];
    const teamAccount = accounts[1];
    const userAccount = accounts[2];
    let snapshotId;
    const dragonTypes = [0,1,2,3,4];
    const senders = [accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8], accounts[9]];
    before(async () => {
        ({
            treasury, eggStorage, dragonStorage, random,
            getter, gladiatorBattle, gladiatorBattleStorage,
            mainBase, mainBattle, events, mainMarket, gold,
            upgradeController, gladiatorBattleSpectatorsStorage,
        } = await deployer(owner, teamAccount));

        const randomMock = await RandomMock.new({from: owner});
        await randomMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(random.address, randomMock.address, {from: owner});
        random = randomMock

        let goldMock = await GoldMock.new(treasury.address, {from: owner});
        await goldMock.transferOwnership(upgradeController.address);
        await upgradeController.migrate(gold.address, goldMock.address, {from: owner});
        gold = goldMock;

        await gold.mint(teamAccount, toWei('10000000'));

        for (let i = 0; i < senders.length + 2 + 2; i++) {
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

    describe('#matchOpponents', async () => {
        it('should match', async () => {
            let dragons = await dragonStorage.tokensOfOwner(senders[0]);
            const opponents = await mainBattle.matchOpponents(dragons[0]);
            opponents.length.should.be.equal(6);
        })
    })

    describe('#battle', async () => {
        it('should fire events', async() => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];

            const {receipt} = await mainBattle.battle(myDragons[0], yourDragons[0], tactics, { from: senders[0] });
            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('BattleHealthAndMana');
            logs[0].args.battleId.should.be.eq.BN(0);

            logs[1].event.should.be.equal('BattleEnded');
            logs[2].event.should.be.equal('BattleDragonsDetails');
            logs[3].event.should.be.equal('BattleSkills');
            logs[4].event.should.be.equal('BattleTacticsAndBuffs');
        })

        it('cannot send foreign dragon', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const hisDragons = await dragonStorage.tokensOfOwner(senders[2]);
            const tactics = [80, 80];

            const error = await mainBattle.battle(hisDragons[0], yourDragons[0], tactics, { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("not an owner");
        })

        it('cannot fight agains your own dragon', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];

            const error = await mainBattle.battle(myDragons[0], myDragons[1], tactics, { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("can't be owner of opponent dragon");
        })

        it('cannot fight agains non-existen dragon', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];

            const error = await mainBattle.battle(myDragons[0], toBN('99'), tactics, { from: senders[0] }).should.be.rejected;
            // there is no reason here... why?
            // error.reason.should.be.equal("invalid address");
        })

        it('cannot fight agains zero dragon', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const error = await mainBattle.battle(myDragons[0], toBN('0'), tactics, { from: senders[0] }).should.be.rejected;
            // there is no reason here... why?
            //error.reason.should.be.equal("invalid address");
        })

        it('cannot fight by non-existen dragon', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];

            const error = await mainBattle.battle(toBN('99'), yourDragons[0], tactics, { from: senders[0] }).should.be.rejected;
            // there is no reason here... why?
            // error.reason.should.be.equal("invalid address");
        })

        it('cannot fight if opponent has not full health', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];

            await mainBattle.battle(myDragons[0], yourDragons[0], tactics, { from: senders[0] })

            const error = await mainBattle.battle(myDragons[1], yourDragons[0], tactics, { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("opponent dragon is untouchable");
        })

        it('cannot fight if dragon has lower than 50% health', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];

            await mainBattle.battle(myDragons[0], yourDragons[0], tactics, { from: senders[0] });

            const error = await mainBattle.battle(myDragons[0], yourDragons[1], tactics, { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("dragon's health less than 50%");
        })

        it('tactics should be between 20 and 80', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];

            let error = await mainBattle.battle(myDragons[0], yourDragons[0], [19, 80], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBattle.battle(myDragons[0], yourDragons[0], [0, 80], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBattle.battle(myDragons[0], yourDragons[0], [81, 80], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBattle.battle(myDragons[0], yourDragons[0], [1001, 80], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");

            error = await mainBattle.battle(myDragons[0], yourDragons[0], [80, 19], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBattle.battle(myDragons[0], yourDragons[0], [80, 0], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBattle.battle(myDragons[0], yourDragons[0], [80, 81], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
            error = await mainBattle.battle(myDragons[0], yourDragons[0], [80, 1000], { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("tactics value must be between 20 and 80");
        })

        it('cannot fight if opponent dragon on breeding sale')
        it('cannot fight if opponent dragon on breeding sale')
        it('cannot fight if dragon in gladiator battle', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const _tactics = [80, 80];
            const _isGold = false;
            const _bet = toWei('0.1');
            const _counter = toBN(5);
            await mainBattle.createGladiatorBattle(myDragons[0], _tactics, _isGold, _bet, _counter, {from: senders[0], value: toWei('0.1')});
            let error = await mainBattle.battle(myDragons[0], yourDragons[0], _tactics, { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("your dragon participates in gladiator battle");

        })
        it('cannot fight if opponent dragon in gladiator battle', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const _tactics = [80, 80];
            const _isGold = false;
            const _bet = toWei('0.1');
            const _counter = toBN(5);
            await mainBattle.createGladiatorBattle(yourDragons[0], _tactics, _isGold, _bet, _counter, {from: senders[1], value: toWei('0.1')});
            let error = await mainBattle.battle(myDragons[0], yourDragons[0], _tactics, { from: senders[0] }).should.be.rejected;
            error.reason.should.be.equal("opponent dragon participates in gladiator battle");
        })
    })

    describe('#createGladiatorBattle', async () => {
        it('challenge should be created', async () => {
            const first = senders[0];
            const myDragons = await dragonStorage.tokensOfOwner(first);
            const myTactics = [toBN(80), toBN(80)];
            const isGold = false;
            const bet = toWei('1');
            const counter = 5;
            const totalAmountBefore = await getter.gladiatorBattlesAmount();
            const firstBattlesBefore = await getter.getUserGladiatorBattles(first);
            await mainBattle.createGladiatorBattle(myDragons[0], myTactics, isGold, bet, counter, {from: first, value: bet});
            const firstBattlesAfter = await getter.getUserGladiatorBattles(first);
            const totalAmountAfter = await getter.gladiatorBattlesAmount();
            const challenge = await getter.getGladiatorBattleDetails(firstBattlesAfter[firstBattlesAfter.length - 1]);

            totalAmountBefore.should.be.eq.BN(totalAmountAfter.sub(toBN('1')));
            firstBattlesBefore.should.be.deep.equal([]);
            challenge.isGold.should.be.equal(isGold);
            challenge.bet.should.be.eq.BN(bet);
            challenge.counter.should.be.eq.BN(counter);
            challenge.active.should.be.equal(true);
            challenge.cancelled.should.be.equal(false);
            challenge.extensionTimePrice.should.be.eq.BN(EXTENSION_TIME_START_PRICE);
            challenge.battleId.should.be.eq.BN('0');
            challenge.autoSelectBlock.should.be.eq.BN('0');

            const {gladiatorBattleId, tactics} = await getter.getDragonApplicationForGladiatorBattle(myDragons[0]);
            tactics.should.be.deep.equal(myTactics);
        })

        it('cannot create with foreign drago', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            const counter = 5;
            const error = await mainBattle.createGladiatorBattle(yourDragons[0], tactics, isGold, bet, counter, {from: senders[0], value: bet}).should.be.rejected;
            error.reason.should.be.equal('not a dragon owner');
        })

        it('cannot create if dragon is on sale', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            const counter = 5;
            await mainMarket.sellDragon(myDragons[0], toWei('1'), toWei('1'), 1, true, {from: senders[0]});

            const error = await mainBattle.createGladiatorBattle(myDragons[0], tactics, isGold, bet, counter, {from: senders[0], value: bet}).should.be.rejected;
            error.reason.should.be.equal("dragon is on sale");
        })

        it('cannot create if dragon is on breeding sale')

        it('cannot create if already applied', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            const counter = 5;
            await mainBattle.createGladiatorBattle(myDragons[0], tactics, isGold, bet, counter, {from: senders[0], value: bet});
            const error = await mainBattle.createGladiatorBattle(myDragons[0], tactics, isGold, bet, counter, {from: senders[0], value: bet}).should.be.rejected;
            error.reason.should.be.equal('this dragon has already applied');
        })

        it('should validate ETH bet correctly', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            const counter = 5;
            const error = await mainBattle.createGladiatorBattle(
                myDragons[0],
                tactics,
                isGold,
                bet,
                counter,
                {from: senders[0], value: toBN(bet).div(toBN('2'))}
            ).should.be.rejected;
            error.reason.should.be.equal('wrong eth amount');
        })

        it('should validate GOLD bet correctly', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = true;
            const bet = toWei('1');
            const counter = 5;
            const error = await mainBattle.createGladiatorBattle(
                myDragons[0],
                tactics,
                isGold,
                bet,
                counter,
                {from: senders[0]}
            ).should.be.rejected;
            error.reason.should.be.equal('not enough tokens');
        })

        it('should validate counter correctly', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            let counter = 4;
            let error = await mainBattle.createGladiatorBattle(
                myDragons[0], tactics, isGold, bet,
                counter,
                {from: senders[0], value: bet}
            ).should.be.rejected;
            error.reason.should.be.equal('too few blocks');

            counter = 70000;
            // error = await mainBattle.createGladiatorBattle(
            //     myDragons[0], tactics, isGold, bet,
            //     counter,
            //     {from: senders[0], value: bet}
            // ).should.be.rejected;
            // error.reason.should.be.equal('too much blocks');

            // await mainBattle.createGladiatorBattle(myDragons[0], tactics, isGold, bet, counter, {from: senders[0], value: bet});
            // const firstBattlesAfter = await getter.getUserGladiatorBattles(senders[0]);
            // const challenge = await getter.getGladiatorBattleDetails(firstBattlesAfter[firstBattlesAfter.length - 1]);
            // console.log(challenge);
        })
    })

    describe('#applyForGladiatorBattle', async() => {

        beforeEach(async() => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            let counter = 5;
            await mainBattle.createGladiatorBattle(
                myDragons[0], tactics, isGold, bet,
                counter,
                {from: senders[0], value: bet}
            )
        })

        it('should be applied', async () => {
            const yourTactics = [toBN(79), toBN(79)];
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);
            const {receipt} = await mainBattle.applyForGladiatorBattle(challengeId, yourDragons[0], yourTactics, {from: senders[1], value: challengeBefore.bet});

            const challengeAfter = await getter.getGladiatorBattleDetails(challengeId);
            challengeAfter.autoSelectBlock.should.be.eq.BN(AUTO_SELECT_TIME.add(toBN(receipt.blockNumber)));
            const applicants = await getter.getGladiatorBattleApplicants(challengeId);
            applicants[0].should.be.eq.BN(yourDragons[0]);
            const {gladiatorBattleId, tactics} = await getter.getDragonApplicationForGladiatorBattle(yourDragons[0]);
            tactics.should.be.deep.equal(yourTactics);

            const yourApplication = await gladiatorBattleStorage.getUserApplications(senders[1]);
            yourApplication.should.be.eq.BN(challengeId);
        })

        it('should validate challenge id', async() => {
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);
            let error = await mainBattle.applyForGladiatorBattle(
                challengeId.add(toBN('1')), yourDragons[0], yourTactics,
                {from: senders[1], value: challengeBefore.bet}).should.be.rejected;
            error.reason.should.be.equal('wrong challenge id');

            error = await mainBattle.applyForGladiatorBattle(
                0, yourDragons[0], yourTactics,
                {from: senders[1], value: challengeBefore.bet}).should.be.rejected;
            error.reason.should.be.equal('wrong challenge id');
        })

        it('cannot apply foreign drago', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);
            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, myDragons[1], yourTactics,
                {from: senders[1], value: challengeBefore.bet}).should.be.rejected;
            error.reason.should.be.equal('not a dragon owner');
        })

        it('cannot apply the same dragon twice', async () => {
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);
            await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                {from: senders[1], value: challengeBefore.bet})

            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                {from: senders[1], value: challengeBefore.bet}).should.be.rejected;
            error.reason.should.be.equal('this dragon has already applied');
        })

        it('cannot apply the twice', async () => {
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);
            await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                {from: senders[1], value: challengeBefore.bet})

            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[1], yourTactics,
                {from: senders[1], value: challengeBefore.bet}).should.be.rejected;
            error.reason.should.be.equal('you have already applied');
        })

        it('cannot apply creator\'s dragon' , async () => {
            const myTactics = [toBN(79), toBN(79)];
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);
            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, myDragons[0], myTactics,
                {from: senders[0], value: challengeBefore.bet}).should.be.rejected;
            error.reason.should.be.equal('this dragon has already applied');
        })

        it('should validate ETH bet', async () => {
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);

            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[1], yourTactics,
                {from: senders[1], value: challengeBefore.bet.div(toBN(2))}).should.be.rejected;
            error.reason.should.be.equal('wrong eth amount');
        })

        it('should validate GOLD bet', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = true;
            const bet = toWei('1');
            let counter = 5;

            await gold.transfer(senders[0], bet, {from: teamAccount});
            await mainBattle.createGladiatorBattle(
                myDragons[1], tactics, isGold, bet,
                counter,
                {from: senders[0]}
            )

            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];

            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[1], yourTactics,
                {from: senders[1]}).should.be.rejected;
            error.reason.should.be.equal('not enough tokens');
        })

        it('cannot apply for if battle has occured', async () => {
            const bet = toWei('1');
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                { from: senders[1], value: bet }
            );
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.chooseOpponentForGladiatorBattle(challengeId, applicants.slice(-1)[0], hash, {from: senders[0]});
            for (i = 0; i < 5; i++) { await mineBlock(); }
            await mainBattle.startGladiatorBattle(challengeId);

            const hisDragons = await dragonStorage.tokensOfOwner(senders[2]);
            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, hisDragons[0], yourTactics,
                {from: senders[2]}).should.be.rejected;
            error.reason.should.be.equal('the battle has already occured');
        })

        it('cannot apply for cancelled battle', async () => {
            const bet = toWei('1');
            const hisTactics = [toBN(79), toBN(79)];
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                { from: senders[1], value: bet }
            );
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[0]});

            const hisDragons = await dragonStorage.tokensOfOwner(senders[4]);
            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, hisDragons[0], hisTactics,
                { from: senders[4], value: bet }
            ).should.be.rejected;
            error.reason.should.be.equal('the challenge is cancelled');
        })

        it('cannot apply if opponent selected', async () => {
            const bet = toWei('1');
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                { from: senders[1], value: bet }
            );
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.chooseOpponentForGladiatorBattle(challengeId, applicants.slice(-1)[0], hash, {from: senders[0]});

            const hisDragons = await dragonStorage.tokensOfOwner(senders[4]);
            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, hisDragons[0], yourTactics,
                { from: senders[4], value: bet }
            ).should.be.rejected;
            error.reason.should.be.equal('opponent already selected');
        })

        it('cannot apply if dragon too strong')

        it('cannot apply if dragon is on sale', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const tactics = [80, 80];
            await mainMarket.sellDragon(yourDragons[0], toWei('1'), toWei('1'), 1, true, {from: senders[1]});

            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            let error = await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], tactics,
                {from: senders[1]}).should.be.rejected;
            error.reason.should.be.equal("dragon is on sale");
        })

        it('cannot apply if dragon is on breeding sale')
        it('some test about peacefull skill also')
    })

    function getApplicantsHash(array) {
        return web3.utils.keccak256(web3.eth.abi.encodeParameter('uint256[]', array), { encoding: 'hex' });
    }

    describe('#chooseOpponentForGladiatorBattle', async() => {
        beforeEach(async() => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            let counter = 5;
            await mainBattle.createGladiatorBattle(
                myDragons[0], tactics, isGold, bet,
                counter,
                {from: senders[0], value: bet}
            )

            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                {from: senders[1], value: bet}
            );

        })


        it('should work', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const participantsBefore = await gladiatorBattleStorage.getChallengeParticipants(challengeId);
            const hash = getApplicantsHash(applicants);
            await mainBattle.chooseOpponentForGladiatorBattle(challengeId, applicants.slice(-1)[0], hash, {from: senders[0]});

            const myChallenges = await gladiatorBattleStorage.getUserChallenges(senders[0]);
            const yourChallenges = await gladiatorBattleStorage.getUserChallenges(senders[1]);
            myChallenges.should.be.deep.equal(yourChallenges);

            const participantsAfter = await gladiatorBattleStorage.getChallengeParticipants(challengeId);
            participantsBefore.firstUser.should.be.equal(participantsAfter.firstUser);
            participantsBefore.firstDragonId.should.be.eq.BN(participantsAfter.firstDragonId);
            participantsBefore.secondUser.should.be.equal('0x0000000000000000000000000000000000000000');
            participantsAfter.secondUser.should.be.equal(senders[1]);
            participantsAfter.secondDragonId.should.be.eq.BN(yourDragons[0]);

            const yourApplication = await gladiatorBattleStorage.getUserApplications(senders[1]);
            yourApplication.should.be.deep.equal([]);
        })


        it('should be a battle creator', async () => {
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            const error = await mainBattle.chooseOpponentForGladiatorBattle(
                challengeId, applicants.slice(-1)[0], hash, {from: senders[1]}).should.be.rejected;
            error.reason.should.be.equal("not a challenge creator");
        })

        it('should validate challenge id', async() => {
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            let error = await mainBattle.chooseOpponentForGladiatorBattle(
                0, applicants.slice(-1)[0], hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("wrong challenge id");

            error = await mainBattle.chooseOpponentForGladiatorBattle(
                challengeId.add(toBN('1')), applicants.slice(-1)[0], hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("wrong challenge id");
        })

        it('cannot choose yourself', async() => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            let error = await mainBattle.chooseOpponentForGladiatorBattle(
                challengeId, myDragons[0], hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("the same dragon");
        })

        it('for rest of applicants compensation should be arranged', async() => {
            const bet = toBN(toWei('1'));
            const hisTactics = [toBN(78), toBN(78)];
            const hisDragons = await dragonStorage.tokensOfOwner(senders[2]);
            const herDragons = await dragonStorage.tokensOfOwner(senders[3]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, hisDragons[0], hisTactics,
                {from: senders[2], value: bet}
            );
            await mainBattle.applyForGladiatorBattle(
                challengeId, herDragons[0], hisTactics,
                {from: senders[3], value: bet}
            );

            let applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);

            await mainBattle.chooseOpponentForGladiatorBattle(
                challengeId, herDragons[0], hash, {from: senders[0]})

            applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId);
            const challenge = await gladiatorBattleStorage.getChallengeDetails(challengeId);
            //_bet.mul(3).div(10).div(_applicantsAmount)
            const compensation = bet.mul(toBN('3')).div(toBN('10')).div(toBN(applicants.length - 1));
            challenge.compensation.should.be.eq.BN(compensation);
        })

        it('cannot choose if opponent selected', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const bet = toBN(toWei('1'));
            const hisTactics = [toBN(78), toBN(78)];
            const hisDragons = await dragonStorage.tokensOfOwner(senders[2]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, hisDragons[0], hisTactics,
                {from: senders[2], value: bet}
            );
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.chooseOpponentForGladiatorBattle(challengeId, applicants.slice(-1)[0], hash, {from: senders[0]});
            let error = await mainBattle.chooseOpponentForGladiatorBattle(
                challengeId, applicants[0], hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("opponent already selected");
        })

        it('cannot choose non-applied opponent', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);

            let error = await mainBattle.chooseOpponentForGladiatorBattle(
                challengeId, yourDragons[1], hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("wrong opponent");
        })

        it('cannot choose if battle is cancelled')
        it('cannot choose if opponent quit')

        it('should fail if wrong applicants array', async() => {
            const bet = toBN(toWei('1'));
            const hisTactics = [toBN(78), toBN(78)];
            const hisDragons = await dragonStorage.tokensOfOwner(senders[2]);
            const herDragons = await dragonStorage.tokensOfOwner(senders[3]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, hisDragons[0], hisTactics,
                {from: senders[2], value: bet}
            );
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.applyForGladiatorBattle(
                challengeId, herDragons[0], hisTactics,
                {from: senders[3], value: bet}
            );

            const error = await mainBattle.chooseOpponentForGladiatorBattle(challengeId, herDragons[0], hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("wrong applicants array");
        })
    })

    describe('#autoSelectOpponentForGladiatorBattle', async () => {
        let gladiatorBattleMock;


        beforeEach(async () => {
            gladiatorBattleMock = await GladiatorBattleMock.new({from: owner});
            await gladiatorBattleMock.transferOwnership(upgradeController.address);
            await upgradeController.migrate(gladiatorBattle.address, gladiatorBattleMock.address, {from: owner});
            // gladiatorBattle = gladiatorBattleMock;
            await gladiatorBattleMock.setAUTO_SELECT_TIME(4);

            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            let counter = 5;
            await mainBattle.createGladiatorBattle(
                myDragons[0], tactics, isGold, bet,
                counter,
                {from: senders[0], value: bet}
            )
            const yourTactics = [toBN(79), toBN(79)];
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            await mainBattle.applyForGladiatorBattle(
                challengeId, yourDragons[0], yourTactics,
                {from: senders[1], value: bet}
            );
            const hisTactics = [toBN(78), toBN(78)];
            const hisDragons = await dragonStorage.tokensOfOwner(senders[2]);
            const herDragons = await dragonStorage.tokensOfOwner(senders[3]);
            await mainBattle.applyForGladiatorBattle(
                challengeId, hisDragons[0], hisTactics,
                {from: senders[2], value: bet}
            );
            await mainBattle.applyForGladiatorBattle(
                challengeId, herDragons[0], hisTactics,
                {from: senders[3], value: bet}
            );
        })

        it('should work', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];

            const participantsBefore = await gladiatorBattleStorage.getChallengeParticipants(challengeId);

            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);

            for (i = 0; i < 5; i++) { await mineBlock(); }
            await mainBattle.autoSelectOpponentForGladiatorBattle(challengeId, hash, {from: senders[0]});

            const participantsAfter = await gladiatorBattleStorage.getChallengeParticipants(challengeId);
            participantsBefore.firstUser.should.be.equal(participantsAfter.firstUser);
            participantsBefore.firstDragonId.should.be.eq.BN(participantsAfter.firstDragonId);
            participantsBefore.secondUser.should.be.equal('0x0000000000000000000000000000000000000000');
            // for us opponent is not random actually. See RandomMock.sol
            participantsAfter.secondUser.should.be.equal(senders[1]);
            participantsAfter.secondDragonId.should.be.eq.BN(yourDragons[0]);

            const yourApplication = await gladiatorBattleStorage.getUserApplications(senders[1]);
            yourApplication.should.be.deep.equal([]);
        })

        it('it is too early', async () => {
            const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const participantsBefore = await gladiatorBattleStorage.getChallengeParticipants(challengeId);
            const challengeBefore = await getter.getGladiatorBattleDetails(challengeId);
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            let error = await mainBattle.autoSelectOpponentForGladiatorBattle(challengeId, hash, {from: senders[0]}).should.be.rejected;
            // EVM returns right error but truffle can't parse it
            // error.reason.should.be.equal("time has not yet come");
        })

        it('no autoselect', async () => {
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
            const tactics = [80, 80];
            const isGold = false;
            const bet = toWei('1');
            let counter = 5;
            await mainBattle.createGladiatorBattle(
                myDragons[1], tactics, isGold, bet,
                counter,
                {from: senders[0], value: bet}
            )
            for (i = 0; i < 5; i++) { await mineBlock(); }
            const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            let error = await mainBattle.autoSelectOpponentForGladiatorBattle(challengeId, hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("no auto select");
        })

        it('there is no participants (they are quit)')
    })

    describe('#startGladiatorBattle', async () => {
        it('should work', async () => {
            const challengeId = await setBattle();
            const myDragons = await dragonStorage.tokensOfOwner(senders[0]);

            const balanceBefore = await web3.eth.getBalance(senders[0]);
            const challenge = await getter.getGladiatorBattleDetails(challengeId);

            const {receipt} = await mainBattle.startGladiatorBattle(challengeId);

            const logs = await events.getPastEvents({fromBlock: receipt.blockNumber, toBlock: 'latest'});
            logs[0].event.should.be.equal('GladiatorBattleEnded');
            logs[0].args.id.should.be.eq.BN(1);
            logs[0].args.battleId.should.be.eq.BN(0);
            logs[0].args.winner.should.be.equal(senders[0]);
            logs[0].args.looser.should.be.equal(senders[3]);

            logs[1].event.should.be.equal('BattleHealthAndMana');
            logs[2].event.should.be.equal('BattleEnded');
            logs[3].event.should.be.equal('BattleDragonsDetails');
            logs[4].event.should.be.equal('BattleSkills');
            logs[5].event.should.be.equal('BattleTacticsAndBuffs');

            const spectatorsBets = await gladiatorBattleSpectatorsStorage.getChallengeBetsValue(challengeId);
            const spectatorsReward = spectatorsBets.onOpponent.mul(toBN(15)).div(toBN(100));

            const balanceAfter = await web3.eth.getBalance(senders[0]);
            const reward = challenge.bet.mul(toBN(17)).div(toBN(10)).add(spectatorsReward);
            balanceBefore.should.be.eq.BN(toBN(balanceAfter).sub(reward));

            const participantsAfter = await gladiatorBattleStorage.getChallengeParticipants(challengeId);
            participantsAfter.winnerUser.should.be.equal(senders[0]);
            participantsAfter.winnerDragonId.should.be.eq.BN(myDragons[0]);
        })

        it('should validate challenge id', async() => {
            const challengeId = await setBattle();
            let error = await mainBattle.startGladiatorBattle(0).should.be.rejected;
            error.reason.should.be.equal("wrong challenge id");

            error = await mainBattle.startGladiatorBattle(challengeId.add(toBN('1'))).should.be.rejected;
            error.reason.should.be.equal("wrong challenge id");
        })

        it('cannot start if opponent is not selected', async () => {
            const challengeId = await setBattle("applyOne");
            let error = await mainBattle.startGladiatorBattle(challengeId).should.be.rejected;
            error.reason.should.be.equal("opponent is not selected");
        })

        it('too early for battle', async () => {
            const challengeId = await setBattle("chooseOpponent");
            let error = await mainBattle.startGladiatorBattle(challengeId).should.be.rejected;
            error.reason.should.be.equal("time has not yet come");

        })

        it('256 passed blocks check', async () => {
            const challengeId = await setBattle();
            for (i = 0; i < 256; i++) { await mineBlock(); }
            let error = await mainBattle.startGladiatorBattle(challengeId).should.be.rejected;
            error.reason.should.be.equal("time has passed");
        })

        it('cannot start Battle if it occured', async () => {
            const challengeId = await setBattle();
            await mainBattle.startGladiatorBattle(challengeId);
            let error = await mainBattle.startGladiatorBattle(challengeId).should.be.rejected;
            error.reason.should.be.equal("the battle has already occured");
        })

        it('cannot start id cancelled')
    })

    describe('#cancelGladiatorBattle', async () => {
        it('should work', async () => {
            const bet = toBN(toWei('1'));
            const challengeId = await setBattle("applyThree");
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[0]});

            const challenge = await gladiatorBattleStorage.getChallengeDetails(challengeId);
            challenge.cancelled.should.be.equal(true);

            //_bet.mul(3).div(10).div(_applicantsAmount)
            const compensation = bet.mul(toBN('3')).div(toBN('10')).div(toBN(applicants.length));
            challenge.compensation.should.be.eq.BN(compensation);
        })

        it('all participants should be rewarded', async() => {
            const bet = toBN(toWei('1'));
            const challengeId = await setBattle("applyThree");

            const challenge = await gladiatorBattleStorage.getChallengeDetails(challengeId);

            let balancesBefore = [];
            for(i=0; i< 4; i++) {
                balancesBefore.push(await web3.eth.getBalance(senders[i]));
            }
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[0], gasPrice: 0});

            let balancesAfter = [];
            for(i=0; i< 4; i++) {
                balancesAfter.push(await web3.eth.getBalance(senders[i]));
            }

            const betCompensation = bet.mul(toBN('70')).div(toBN('100'));
            balancesBefore[0].should.be.eq.BN(toBN(balancesAfter[0]).sub(betCompensation));

            for(i=1; i< 4; i++) {
                balancesBefore[i].should.be.eq.BN(balancesAfter[i]);
            }
        })

        it('cannot cancel if opponent selected', async () => {
            const challengeId = await setBattle();
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            const error = await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("opponent already selected");

        })

        it('should validate challenge id',async () => {
            const challengeId = await setBattle("applyThree");

            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);

            let error = await mainBattle.cancelGladiatorBattle(0, hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal('wrong challenge id');

            error = await mainBattle.cancelGladiatorBattle(challengeId.add(toBN(1)), hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal('wrong challenge id');
        })

        it('cannot cancel foreign battle', async () => {
            const challengeId = await setBattle("applyThree");
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            const error = await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[1]}).should.be.rejected;
            error.reason.should.be.equal("not a challenge creator");
        })

        it('cannot cancel twice', async () => {
            const challengeId = await setBattle("applyThree");
            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);
            await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[0]});

            const error = await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("the challenge is cancelled");

        })

        it('cannot cancel if battle occured', async () => {
            const challengeId = await setBattle();
            await mainBattle.startGladiatorBattle(challengeId);

            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
            const hash = getApplicantsHash(applicants);

            const error = await mainBattle.cancelGladiatorBattle(challengeId, hash, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("opponent already selected");
        })
    })

    describe('#returnBetFromGladiatorBattle', async () => {
        it('should work', async () => {
            const bet = toBN(toWei('1'));
            const challengeId = await setBattle();
            await mainBattle.startGladiatorBattle(challengeId);

            let balanceBefore = await web3.eth.getBalance(senders[1]);
            await mainBattle.returnBetFromGladiatorBattle(challengeId, {from: senders[1], gasPrice: 0});
            let balanceAfter = await web3.eth.getBalance(senders[1]);

            const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId);
            const compensation = bet.add(bet.mul(toBN(3)).div(toBN(10)).div(toBN(applicants.length)));
            balanceBefore.should.be.eq.BN(toBN(balanceAfter).sub(compensation));

            balanceBefore = await web3.eth.getBalance(senders[2]);
            await mainBattle.returnBetFromGladiatorBattle(challengeId, {from: senders[2], gasPrice: 0});
            balanceAfter = await web3.eth.getBalance(senders[2]);

            balanceBefore.should.be.eq.BN(toBN(balanceAfter).sub(compensation));

            (await web3.eth.getBalance(gladiatorBattleStorage.address)).should.be.eq.BN(0);
        })

        it('cannot return if selected as opponent', async () => {
            const challengeId = await setBattle();
            await mainBattle.startGladiatorBattle(challengeId);
            const error = await mainBattle.returnBetFromGladiatorBattle(challengeId, {from: senders[3]}).should.be.rejected;
            error.reason.should.be.equal("wrong challenge");
        })

        it('cannot return if a creator', async () => {
            const challengeId = await setBattle();
            await mainBattle.startGladiatorBattle(challengeId);
            const error = await mainBattle.returnBetFromGladiatorBattle(challengeId, {from: senders[0]}).should.be.rejected;
            error.reason.should.be.equal("wrong challenge");
        })

        it('cannot return if not a participant at all', async () => {
            const challengeId = await setBattle();
            await mainBattle.startGladiatorBattle(challengeId);
            const error = await mainBattle.returnBetFromGladiatorBattle(challengeId, {from: accounts[0]}).should.be.rejected;
            error.reason.should.be.equal("wrong challenge");
        })

        it('cannot return twice', async () => {
            const challengeId = await setBattle();
            await mainBattle.startGladiatorBattle(challengeId);
            await mainBattle.returnBetFromGladiatorBattle(challengeId, {from: senders[1], gasPrice: 0});
            const error = await mainBattle.returnBetFromGladiatorBattle(challengeId, {from: senders[1], gasPrice: 0}).should.be.rejected;
            error.reason.should.be.equal("wrong challenge");
        })
    })

    describe('#addTimeForOpponentSelectForGladiatorBattle', async () => {
        it('should work', async ()=> {
            const EXTEND_TIME_PRICE = toBN(50).mul(toBN(10).pow(toBN(18)));
            const AUTO_SELECT_TIME = toBN(6000);
            const challengeId = await setBattle('applyOne');
            await gold.transfer(senders[0], toWei('1000'), {from: teamAccount});

            const balanceBefore = await gold.balanceOf(senders[0]);
            const challengeBefore = await gladiatorBattleStorage.getChallengeDetails(challengeId);
            await mainBattle.addTimeForOpponentSelectForGladiatorBattle(challengeId, {from: senders[0]});
            const challengeAfter = await gladiatorBattleStorage.getChallengeDetails(challengeId);
            const balanceAfter = await gold.balanceOf(senders[0]);
            challengeAfter.opponentAutoSelectBlock.sub(AUTO_SELECT_TIME).should.be.eq.BN(challengeBefore.opponentAutoSelectBlock);
            challengeAfter.selectionExtensionTimePrice.should.be.eq.BN(EXTEND_TIME_PRICE.mul(toBN(2)));
            toBN(balanceAfter).add(EXTEND_TIME_PRICE).should.be.eq.BN(balanceBefore);
        })

        it('can be called by creator only', async () => {
            const challengeId = await setBattle('applyOne');
            await gold.transfer(senders[0], toWei('1000'), {from: teamAccount});

            const error = await mainBattle.addTimeForOpponentSelectForGladiatorBattle(challengeId, {from: senders[1]}).should.be.rejected;
            error.reason.should.be.equal('not a challenge creator');
        })
    })

    describe('#updateBlockNumberOfGladiatorBattle', async () => {
        it('should work', async () => {
            const challengeId = await setBattle();
            for (i = 0; i < 257; i++) { await mineBlock(); }

            await mainBattle.updateBlockNumberOfGladiatorBattle(challengeId);
            const challengeAfter = await gladiatorBattleStorage.getChallengeDetails(challengeId);

            const blockNumber = (await web3.eth.getBlock("latest")).number;
            challengeAfter.blockNumber.should.be.eq.BN(toBN(blockNumber).add(toBN(1000)));
        })

        it('can call only if it is too late to start battle', async() => {
            const challengeId = await setBattle();

            const error = await mainBattle.updateBlockNumberOfGladiatorBattle(challengeId).should.be.rejected;
            error.reason.should.be.equal('you can start a battle');
        })
    })

    async function setBattle(stage, isGold = false, counter = 5) {
        const myDragons = await dragonStorage.tokensOfOwner(senders[0]);
        const tactics = [80, 80];
        const bet = toWei('1');
        const value = isGold ? 0 : bet;
        if (isGold) {
            for (let i = 0; i < 4; i++) {
                await gold.transfer(senders[i], bet, { from: teamAccount });
            }
        }
        await mainBattle.createGladiatorBattle(
            myDragons[0], tactics, isGold, bet,
            counter,
            { from: senders[0], value }
        )

        if(stage === "create") { return challengeId }

        const yourTactics = [toBN(79), toBN(79)];
        const yourDragons = await dragonStorage.tokensOfOwner(senders[1]);
        const challengeId = (await getter.getUserGladiatorBattles(senders[0])).slice(-1)[0];
        await mainBattle.applyForGladiatorBattle(
            challengeId, yourDragons[0], yourTactics,
            { from: senders[1], value }
        );

        if(stage === "applyOne") { return challengeId }

        const hisTactics = [toBN(78), toBN(78)];
        const hisDragons = await dragonStorage.tokensOfOwner(senders[2]);
        const herDragons = await dragonStorage.tokensOfOwner(senders[3]);
        await mainBattle.applyForGladiatorBattle(
            challengeId, hisDragons[0], hisTactics,
            { from: senders[2], value }
        );
        await mainBattle.applyForGladiatorBattle(
            challengeId, herDragons[0], hisTactics,
            { from: senders[3], value }
        );

        if(stage === "applyThree") { return challengeId }

        const applicants = await gladiatorBattleStorage.getChallengeApplicants(challengeId); // dragons
        const hash = getApplicantsHash(applicants);
        await mainBattle.chooseOpponentForGladiatorBattle(challengeId, applicants.slice(-1)[0], hash, {from: senders[0]});

        if(stage === "chooseOpponent") { return challengeId }

        for (i = 0; i < 5; i++) { await mineBlock(); }

        return challengeId;

    }

    describe('#placeSpectatorBetOnGladiatorBattle', async () => {
        it('place a bet', async () => {
            const challengeId = await setBattle('chooseOpponent');

            const user = senders[0];
            const gasPrice = new BN(toWei('1', 'gwei'));
            const bet = new BN(toWei('1'));
            const willCreatorWin = true;

            const amountBefore = await gladiatorBattleSpectatorsStorage.betsAmount();

            const betsAmountsBefore = await gladiatorBattleSpectatorsStorage.getChallengeBetsAmount(challengeId);
            const betsValuesBefore = await gladiatorBattleSpectatorsStorage.getChallengeBetsValue(challengeId);
            const betsBalanceBefore = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            await mainBattle.placeSpectatorBetOnGladiatorBattle(
                challengeId,
                willCreatorWin,
                bet,
                { from: user, value: bet, gasPrice }
            );

            (await gladiatorBattleSpectatorsStorage.betsAmount()).should.be.eq.BN(amountBefore.add(new BN(1)));
            const userBet = await gladiatorBattleSpectatorsStorage.getUserBet(user, challengeId);

            userBet.value.should.be.eq.BN(bet);
            userBet.willCreatorWin.should.be.equal(willCreatorWin);
            userBet.active.should.be.equal(true);

            const betsAmountsAfter = await gladiatorBattleSpectatorsStorage.getChallengeBetsAmount(challengeId);
            const betsValuesAfter = await gladiatorBattleSpectatorsStorage.getChallengeBetsValue(challengeId);
            const betsBalanceAfter = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            betsAmountsAfter.onCreator.should.be.eq.BN(betsAmountsBefore.onCreator.add(new BN(1)));
            betsAmountsAfter.onOpponent.should.be.eq.BN(betsAmountsBefore.onOpponent);
            betsValuesAfter.onCreator.should.be.eq.BN(betsValuesBefore.onCreator.add(bet));
            betsValuesAfter.onOpponent.should.be.eq.BN(betsValuesBefore.onOpponent);
            betsBalanceAfter.should.be.eq.BN(betsBalanceBefore.add(bet));
        });

        it('place a bet in eth', async () => {
            const challengeId = await setBattle('chooseOpponent');

            const user = senders[0];
            const gasPrice = new BN(toWei('1', 'gwei'));
            const bet = new BN(toWei('1'));
            const willCreatorWin = true;

            const betsBalanceBefore = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
            const userBalanceBefore = new BN(await web3.eth.getBalance(user));

            const { receipt } = await mainBattle.placeSpectatorBetOnGladiatorBattle(
                challengeId,
                willCreatorWin,
                bet,
                { from: user, value: bet, gasPrice }
            );

            const betsBalanceAfter = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
            const userBalanceAfter = new BN(await web3.eth.getBalance(user));
            const burnedEth = gasPrice.mul(new BN(receipt.gasUsed));

            betsBalanceAfter.should.be.eq.BN(betsBalanceBefore.add(bet));
            userBalanceAfter.should.be.eq.BN(userBalanceBefore.sub(burnedEth).sub(bet));
        });

        it('place a bet in gold', async () => {
            const challengeId = await setBattle('chooseOpponent', true);
            const user = senders[0];

            await gold.transfer(user, toWei('100'), { from: teamAccount });

            const gasPrice = new BN(toWei('1', 'gwei'));
            const bet = new BN(toWei('1'));
            const willCreatorWin = true;

            const betsBalanceBefore = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
            const userBalanceBefore = new BN(await web3.eth.getBalance(user));
            const betsGoldBalanceBefore = new BN(await gold.balanceOf(gladiatorBattleSpectatorsStorage.address));
            const userGoldBalanceBefore = new BN(await gold.balanceOf(user));

            const { receipt } = await mainBattle.placeSpectatorBetOnGladiatorBattle(
                challengeId,
                willCreatorWin,
                bet,
                { from: user, gasPrice }
            );

            const betsBalanceAfter = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
            const userBalanceAfter = new BN(await web3.eth.getBalance(user));
            const betsGoldBalanceAfter = new BN(await gold.balanceOf(gladiatorBattleSpectatorsStorage.address));
            const userGoldBalanceAfter = new BN(await gold.balanceOf(user));
            const burnedEth = gasPrice.mul(new BN(receipt.gasUsed));

            betsBalanceAfter.should.be.eq.BN(betsBalanceBefore);
            userBalanceAfter.should.be.eq.BN(userBalanceBefore.sub(burnedEth));
            betsGoldBalanceAfter.should.be.eq.BN(betsGoldBalanceBefore.add(bet));
            userGoldBalanceAfter.should.be.eq.BN(userGoldBalanceBefore.sub(bet));
        });

        it('cannot send eth when bet is in gold', async () => {
            const challengeId = await setBattle('chooseOpponent', true);
            const user = senders[0];

            await gold.transfer(user, toWei('100'), { from: teamAccount });

            const bet = new BN(toWei('1'));
            const willCreatorWin = true;

            const error = await mainBattle.placeSpectatorBetOnGladiatorBattle(
                challengeId,
                willCreatorWin,
                bet,
                { from: user, value: bet }
            ).should.be.rejected;

            error.reason.should.be.equal('specify isGold as false to send eth');
        });
    });

    describe('#removeSpectatorBetFromGladiatorBattle', async () => {
        it('remove a bet', async () => {
            const challengeId = await setBattle('chooseOpponent');

            const user = senders[0];
            const gasPrice = new BN(toWei('1', 'gwei'));
            const bet = new BN(toWei('1'));
            const willCreatorWin = true;

            const amountBefore = await gladiatorBattleSpectatorsStorage.betsAmount();

            const betsAmountsBefore = await gladiatorBattleSpectatorsStorage.getChallengeBetsAmount(challengeId);
            const betsValuesBefore = await gladiatorBattleSpectatorsStorage.getChallengeBetsValue(challengeId);
            const betsBalanceBefore = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            await mainBattle.placeSpectatorBetOnGladiatorBattle(
                challengeId,
                willCreatorWin,
                bet,
                { from: user, value: bet, gasPrice }
            );

            const userBet = await gladiatorBattleSpectatorsStorage.getUserBet(user, challengeId);

            await mainBattle.removeSpectatorBetFromGladiatorBattle(
                challengeId,
                { from: user, gasPrice }
            );

            (await gladiatorBattleSpectatorsStorage.betsAmount()).should.be.eq.BN(amountBefore.add(new BN(1)));
            await gladiatorBattleSpectatorsStorage.getUserBet(user, challengeId).should.be.rejected;
            const betDetails = await gladiatorBattleSpectatorsStorage.allBets(userBet.betId);

            betDetails.active.should.be.equal(false);

            const betsAmountsAfter = await gladiatorBattleSpectatorsStorage.getChallengeBetsAmount(challengeId);
            const betsValuesAfter = await gladiatorBattleSpectatorsStorage.getChallengeBetsValue(challengeId);
            const betsBalanceAfter = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            betsAmountsAfter.onCreator.should.be.eq.BN(betsAmountsBefore.onCreator);
            betsAmountsAfter.onOpponent.should.be.eq.BN(betsAmountsBefore.onOpponent);
            betsValuesAfter.onCreator.should.be.eq.BN(betsValuesBefore.onCreator);
            betsValuesAfter.onOpponent.should.be.eq.BN(betsValuesBefore.onOpponent);
            betsBalanceAfter.should.be.eq.BN(betsBalanceBefore);
        });

        it('remove a bet (eth)', async () => {
            const challengeId = await setBattle('chooseOpponent');

            const user = senders[0];
            const gasPrice = new BN(toWei('1', 'gwei'));
            const bet = new BN(toWei('1'));
            const willCreatorWin = true;

            const betsBalanceBefore = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
            const userBalanceBefore = new BN(await web3.eth.getBalance(user));

            let result = await mainBattle.placeSpectatorBetOnGladiatorBattle(
                challengeId,
                willCreatorWin,
                bet,
                { from: user, value: bet, gasPrice }
            );

            let burnedEth = gasPrice.mul(new BN(result.receipt.gasUsed));

            result = await mainBattle.removeSpectatorBetFromGladiatorBattle(
                challengeId,
                { from: user, gasPrice }
            );

            burnedEth = burnedEth.add(gasPrice.mul(new BN(result.receipt.gasUsed)));

            const betsBalanceAfter = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
            const userBalanceAfter = new BN(await web3.eth.getBalance(user));

            betsBalanceAfter.should.be.eq.BN(betsBalanceBefore);
            userBalanceAfter.should.be.eq.BN(userBalanceBefore.sub(burnedEth));
        });

        it('remove a bet (gold)', async () => {
            const challengeId = await setBattle('chooseOpponent', true);
            const user = senders[0];

            await gold.transfer(user, toWei('100'), { from: teamAccount });

            const gasPrice = new BN(toWei('1', 'gwei'));
            const bet = new BN(toWei('1'));
            const willCreatorWin = true;

            const betsGoldBalanceBefore = new BN(await gold.balanceOf(gladiatorBattleSpectatorsStorage.address));
            const userGoldBalanceBefore = new BN(await gold.balanceOf(user));

            await mainBattle.placeSpectatorBetOnGladiatorBattle(
                challengeId,
                willCreatorWin,
                bet,
                { from: user, gasPrice }
            );

            await mainBattle.removeSpectatorBetFromGladiatorBattle(
                challengeId,
                { from: user, gasPrice }
            );

            const betsGoldBalanceAfter = new BN(await gold.balanceOf(gladiatorBattleSpectatorsStorage.address));
            const userGoldBalanceAfter = new BN(await gold.balanceOf(user));

            betsGoldBalanceAfter.should.be.eq.BN(betsGoldBalanceBefore);
            userGoldBalanceAfter.should.be.eq.BN(userGoldBalanceBefore);
        });
    });

    describe('#requestSpectatorRewardForGladiatorBattle', async () => {
        async function placeBets(challengeId, isGold, bets = ['2', '1', '3', '0.5', '4']) {
            const users = [senders[4], senders[5], senders[6], senders[7], owner];
            const gasPrice = new BN(toWei('1', 'gwei'));

            if (isGold) {
                for (let i = 0; i < 5; i++) {
                    await gold.transfer(users[i], toWei(bets[i]), { from: teamAccount });
                }
            }

            for (let i = 0; i < 5; i++) {
                const bet = new BN(toWei(bets[i]));
                const willCreatorWin = i < 2;
                await mainBattle.placeSpectatorBetOnGladiatorBattle(
                    challengeId,
                    willCreatorWin,
                    bet,
                    { from: users[i], value: isGold ? 0 : bet, gasPrice }
                );
            }
        }

        async function getBalance(user, isGold) {
          if (isGold) {
              return new BN(await gold.balanceOf(user));
          }
          return new BN(await web3.eth.getBalance(user));
        }

        async function requestReward(challengeId, user, isGold) {
            const gasPrice = new BN(toWei('1', 'gwei'));

            const userBalanceBefore = await getBalance(user, isGold);
            const challengeBalance = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            const {
                receipt,
            } = await mainBattle.requestSpectatorRewardForGladiatorBattle(challengeId, { from: user, gasPrice });

            const userBalanceAfter = await getBalance(user, isGold);

            let reward;
            const winningBetsAmount = await gladiatorBattleSpectatorsStorage.challengeWinningBetsAmount(challengeId);

            if (winningBetsAmount == 0) {
                reward = challengeBalance;
            } else {
                const userBet = await gladiatorBattleSpectatorsStorage.getUserBet(user, challengeId);
                const betsValues = await gladiatorBattleSpectatorsStorage.getChallengeBetsValue(challengeId);
                const multiplier = new BN(1000000);
                const percentage = userBet.value.mul(multiplier).div(betsValues.onCreator);
                reward = betsValues.onOpponent.mul(toBN(85)).div(toBN(100)).mul(percentage).div(multiplier);
                reward = reward.add(userBet.value);
            }

            let expected = userBalanceBefore.add(reward);
            if (!isGold) {
                const burnedEth = gasPrice.mul(new BN(receipt.gasUsed));
                expected = expected.sub(burnedEth);
            }
            userBalanceAfter.should.be.eq.BN(expected);

            return reward;
        }

        it('get a reward', async () => {
            const challengeId = await setBattle('chooseOpponent', false, 10);

            const user = senders[4];

            await placeBets(challengeId);
            for (i = 0; i < 5; i++) {
                await mineBlock();
            }
            await mainBattle.startGladiatorBattle(challengeId);

            await mainBattle.requestSpectatorRewardForGladiatorBattle(challengeId, { from: user });
        });

        it('get rewards (eth) (test with different bet values)', async () => {
            const bets = [
                ['2', '1', '3', '0.5', '4'],
                ['5', '2', '0.1', '0.13', '3.9'],
                ['0.14', '1', '1.12', '0.3', '0.55'],
                ['1', '0.1', '2', '0.6', '1.1'],
                ['0.66', '0.11', '0.4', '0.9', '0.333'],
            ];
            for (let i = 0; i < bets.length; i++) {
                const challengeId = await setBattle('chooseOpponent', false, 10);

                const user = senders[4];

                await placeBets(challengeId, false, bets[i]);
                for (let i = 0; i < 5; i++) {
                    await mineBlock();
                }

                await mainBattle.startGladiatorBattle(challengeId);

                const betsBalanceBefore = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
                const betsInternalBalanceBefore = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

                const reward = await requestReward(challengeId, user);

                const betsBalanceAfter = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
                const betsInternalBalanceAfter = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

                betsBalanceAfter.should.be.eq.BN(betsBalanceBefore.sub(reward));
                betsInternalBalanceAfter.should.be.eq.BN(betsInternalBalanceBefore.sub(reward));
            }
        });

        it('get all rewards (eth)', async () => {
            const challengeId = await setBattle('chooseOpponent', false, 10);

            const users = [senders[4], senders[5]];

            await placeBets(challengeId);
            for (let i = 0; i < 5; i++) {
                await mineBlock();
            }

            await mainBattle.startGladiatorBattle(challengeId);

            await requestReward(challengeId, users[0]);
            await requestReward(challengeId, users[1]);

            const betsBalanceAfter = new BN(await web3.eth.getBalance(gladiatorBattleSpectatorsStorage.address));
            const betsInternalBalanceAfter = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            betsBalanceAfter.should.be.eq.BN(0);
            betsInternalBalanceAfter.should.be.eq.BN(0);
        });

        it('get a reward (gold)', async () => {
            const challengeId = await setBattle('chooseOpponent', true, 15);

            const users = [senders[4], senders[5]];

            await placeBets(challengeId, true);
            for (let i = 0; i < 5; i++) {
                await mineBlock();
            }

            await mainBattle.startGladiatorBattle(challengeId);

            const betsBalanceBefore = new BN(await gold.balanceOf(gladiatorBattleSpectatorsStorage.address));
            const betsInternalBalanceBefore = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            const reward = await requestReward(challengeId, users[0], true);

            const betsBalanceAfter = new BN(await gold.balanceOf(gladiatorBattleSpectatorsStorage.address));
            const betsInternalBalanceAfter = await gladiatorBattleSpectatorsStorage.challengeBalance(challengeId);

            betsBalanceAfter.should.be.eq.BN(betsBalanceBefore.sub(reward));
            betsInternalBalanceAfter.should.be.eq.BN(betsInternalBalanceBefore.sub(reward));
        });

    });

});
