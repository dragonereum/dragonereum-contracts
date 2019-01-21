const should = require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
.should();

const deployer = require('../scripts/deploy');
const {toWei, toBN, randomHex, soliditySha3, fromWei, BN} = web3.utils;
const {takeSnapshot,revertSnapshot, mineBlock} = require('../scripts/ganacheHelper.js');

contract('Gold', async (accounts) => {
    const owner = accounts[0];
    const teamAccount = accounts[1];
    const userAccount = accounts[2];
    let snapshotId;
    const GOLD_TOKEN_NAME = 'Dragonereum Gold';
    const GOLD_TOKEN_SYMBOL = 'GOLD';
    const GOLD_DECIMALS = 18;
    const GOLD_AMOUNT = 60000000;

    const FOUNDER = 1200000; // 1 of 5; 2% * 5 = 10% (6,000,000)
    const FOUNDATION = 6000000; // 10%
    const NONSENSE_GAMES = 3000000; // 5%
    const GAME_ACCOUNT = 45000000; // 75%

    const founders = [
      '0x23b3763f31F4da6B42F47927BCF66A221E8705Cd',
      '0x5CFF40372b96e133967d980F72812653163121fa',
      '0xE246C5Aa2D57878DA70779A75B12dCDFFd77aDBA',
      '0x950eEAf8ddbA1409dbD25aD16d50A867EEA75c3E',
      '0x87252E8F04F6c6bC4d2c690893addb7108aa8a5f'
    ];

    const foundation = '0x5Ff8957EF7e964E8072815211c9Fc3E7F820F1D4';
    const NonsenseGames = '0x10208FB4Ef202BdC49803995b0A8CA185383bba4';


    before(async () => {
        ({ treasury, gold } = await deployer(owner, teamAccount));

        snapshotId = await takeSnapshot();
    })

    afterEach(async () => {
      await revertSnapshot(snapshotId.result);
      snapshotId = await takeSnapshot();
    })

    describe('#constructor', async () => {
        it('all stuff initialized', async () => {
            const totalSupply = (new BN(GOLD_AMOUNT)).mul((new BN(10)).pow(new BN(18)));
            const founderBalance = (new BN(FOUNDER)).mul((new BN(10)).pow(new BN(18)));
            const foundationBalance = (new BN(FOUNDATION)).mul((new BN(10)).pow(new BN(18)));
            const NonsenseGamesBalance = (new BN(NONSENSE_GAMES)).mul((new BN(10)).pow(new BN(18)));
            const gameBalance = (new BN(GAME_ACCOUNT)).mul((new BN(10)).pow(new BN(18)));

            (await gold.name()).should.be.equal(GOLD_TOKEN_NAME);
            (await gold.symbol()).should.be.equal(GOLD_TOKEN_SYMBOL);
            (await gold.decimals()).should.be.eq.BN(GOLD_DECIMALS);
            (await gold.totalSupply()).should.be.eq.BN(totalSupply);
            for (let i = 0; i < founders.length; i++) {
              (await gold.balanceOf(founders[i])).should.be.eq.BN(founderBalance);
            }
            (await gold.balanceOf(foundation)).should.be.eq.BN(foundationBalance);
            (await gold.balanceOf(NonsenseGames)).should.be.eq.BN(NonsenseGamesBalance);
            (await gold.balanceOf(treasury.address)).should.be.eq.BN(gameBalance);
        })
    })
})
