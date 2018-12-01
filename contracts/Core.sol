pragma solidity 0.4.25;


import "./Common/Upgradable.sol";
import "./Dragon/DragonCore.sol";
import "./Dragon/DragonLeaderboard.sol";
import "./Dragon/DragonGetter.sol";
import "./Dragon/DragonGenetics.sol";
import "./Egg/EggCore.sol";
import "./Nest.sol";
import "./Common/SafeMath8.sol";
import "./Common/SafeMath16.sol";
import "./Common/SafeMath32.sol";
import "./Common/SafeMath256.sol";

contract Core is Upgradable {
    using SafeMath8 for uint8;
    using SafeMath16 for uint16;
    using SafeMath32 for uint32;
    using SafeMath256 for uint256;

    DragonCore dragonCore;
    DragonGetter dragonGetter;
    DragonGenetics dragonGenetics;
    EggCore eggCore;
    DragonLeaderboard leaderboard;
    Nest nest;

    function _max(uint16 lth, uint16 rth) internal pure returns (uint16) {
        if (lth > rth) {
            return lth;
        } else {
            return rth;
        }
    }

    function createEgg(
        address _sender,
        uint8 _dragonType
    ) external onlyController returns (uint256) {
        return eggCore.create(_sender, [uint256(0), uint256(0)], _dragonType);
    }

    function sendToNest(
        uint256 _id
    ) external onlyController returns (
        bool isHatched,
        uint256 newDragonId,
        uint256 hatchedId,
        address owner
    ) {
        uint256 _randomForEggOpening;
        (isHatched, hatchedId, _randomForEggOpening) = nest.add(_id);
        // if any egg was hatched
        if (isHatched) {
            owner = eggCore.ownerOf(hatchedId);
            newDragonId = openEgg(owner, hatchedId, _randomForEggOpening);
        }
    }

    function openEgg(
        address _owner,
        uint256 _eggId,
        uint256 _random
    ) internal returns (uint256 newDragonId) {
        uint256[2] memory _parents;
        uint8 _dragonType;
        (_parents, _dragonType) = eggCore.get(_eggId);

        uint256[4] memory _genome;
        uint8[11] memory _dragonTypesArray;
        uint16 _generation;
        // if genesis
        if (_parents[0] == 0 && _parents[1] == 0) {
            _generation = 0;
            _genome = dragonGenetics.createGenomeForGenesis(_dragonType, _random);
            _dragonTypesArray[_dragonType] = 40; // 40 genes of 1 type
        } else {
            uint256[4] memory _momGenome = dragonGetter.getComposedGenome(_parents[0]);
            uint256[4] memory _dadGenome = dragonGetter.getComposedGenome(_parents[1]);
            (_genome, _dragonTypesArray) = dragonGenetics.createGenome(_parents, _momGenome, _dadGenome, _random);
            _generation = _max(
                dragonGetter.getGeneration(_parents[0]),
                dragonGetter.getGeneration(_parents[1])
            ).add(1);
        }

        newDragonId = dragonCore.createDragon(_owner, _generation, _parents, _genome, _dragonTypesArray);
        eggCore.remove(_owner, _eggId);

        uint32 _coolness = dragonGetter.getCoolness(newDragonId);
        leaderboard.update(newDragonId, _coolness);
    }

    function breed(
        address _sender,
        uint256 _momId,
        uint256 _dadId
    ) external onlyController returns (uint256) {
        dragonCore.payDNAPointsForBreeding(_momId);
        dragonCore.payDNAPointsForBreeding(_dadId);
        return eggCore.create(_sender, [_momId, _dadId], 0);
    }

    function setDragonRemainingHealthAndMana(uint256 _id, uint32 _health, uint32 _mana) external onlyController {
        return dragonCore.setRemainingHealthAndMana(_id, _health, _mana);
    }

    function increaseDragonExperience(uint256 _id, uint256 _factor) external onlyController {
        dragonCore.increaseExperience(_id, _factor);
    }

    function upgradeDragonGenes(uint256 _id, uint16[10] _dnaPoints) external onlyController {
        dragonCore.upgradeGenes(_id, _dnaPoints);

        uint32 _coolness = dragonGetter.getCoolness(_id);
        leaderboard.update(_id, _coolness);
    }

    function increaseDragonWins(uint256 _id) external onlyController {
        dragonCore.increaseWins(_id);
    }

    function increaseDragonDefeats(uint256 _id) external onlyController {
        dragonCore.increaseDefeats(_id);
    }

    function setDragonTactics(uint256 _id, uint8 _melee, uint8 _attack) external onlyController {
        dragonCore.setTactics(_id, _melee, _attack);
    }

    function setDragonName(uint256 _id, string _name) external onlyController returns (bytes32) {
        return dragonCore.setName(_id, _name);
    }

    function setDragonSpecialPeacefulSkill(uint256 _id, uint8 _class) external onlyController {
        dragonCore.setSpecialPeacefulSkill(_id, _class);
    }

    function useDragonSpecialPeacefulSkill(
        address _sender,
        uint256 _id,
        uint256 _target
    ) external onlyController {
        dragonCore.useSpecialPeacefulSkill(_sender, _id, _target);
    }

    function resetDragonBuffs(uint256 _id) external onlyController {
        dragonCore.setBuff(_id, 1, 0); // attack
        dragonCore.setBuff(_id, 2, 0); // defense
        dragonCore.setBuff(_id, 3, 0); // stamina
        dragonCore.setBuff(_id, 4, 0); // speed
        dragonCore.setBuff(_id, 5, 0); // intelligence
    }

    function updateLeaderboardRewardTime() external onlyController {
        return leaderboard.updateRewardTime();
    }

    // GETTERS

    function getDragonFullRegenerationTime(uint256 _id) external view returns (uint32 time) {
        return dragonGetter.getFullRegenerationTime(_id);
    }

    function isEggOwner(address _user, uint256 _tokenId) external view returns (bool) {
        return eggCore.isOwner(_user, _tokenId);
    }

    function isEggInNest(uint256 _id) external view returns (bool) {
        return nest.inNest(_id);
    }

    function getEggsInNest() external view returns (uint256[2]) {
        return nest.getEggs();
    }

    function getEgg(uint256 _id) external view returns (uint16, uint32, uint256[2], uint8[11], uint8[11]) {
        uint256[2] memory parents;
        uint8 _dragonType;
        (parents, _dragonType) = eggCore.get(_id);

        uint8[11] memory momDragonTypes;
        uint8[11] memory dadDragonTypes;
        uint32 coolness;
        uint16 gen;
        // if genesis
        if (parents[0] == 0 && parents[1] == 0) {
            momDragonTypes[_dragonType] = 100;
            dadDragonTypes[_dragonType] = 100;
            coolness = 3600;
        } else {
            momDragonTypes = dragonGetter.getDragonTypes(parents[0]);
            dadDragonTypes = dragonGetter.getDragonTypes(parents[1]);
            coolness = dragonGetter.getCoolness(parents[0]).add(dragonGetter.getCoolness(parents[1])).div(2);
            uint16 _momGeneration = dragonGetter.getGeneration(parents[0]);
            uint16 _dadGeneration = dragonGetter.getGeneration(parents[1]);
            gen = _max(_momGeneration, _dadGeneration).add(1);
        }
        return (gen, coolness, parents, momDragonTypes, dadDragonTypes);
    }

    function getDragonChildren(uint256 _id) external view returns (
        uint256[10] dragonsChildren,
        uint256[10] eggsChildren
    ) {
        uint8 _counter;
        uint256[2] memory _parents;
        uint256 i;
        for (i = _id.add(1); i <= dragonGetter.getAmount() && _counter < 10; i++) {
            _parents = dragonGetter.getParents(i);
            if (_parents[0] == _id || _parents[1] == _id) {
                dragonsChildren[_counter] = i;
                _counter = _counter.add(1);
            }
        }
        _counter = 0;
        uint256[] memory eggs = eggCore.getAllEggs();
        for (i = 0; i < eggs.length && _counter < 10; i++) {
            (_parents, ) = eggCore.get(eggs[i]);
            if (_parents[0] == _id || _parents[1] == _id) {
                eggsChildren[_counter] = eggs[i];
                _counter = _counter.add(1);
            }
        }
    }

    function getDragonsFromLeaderboard() external view returns (uint256[10]) {
        return leaderboard.getDragonsFromLeaderboard();
    }

    function getLeaderboardRewards(
        uint256 _hatchingPrice
    ) external view returns (
        uint256[10]
    ) {
        return leaderboard.getRewards(_hatchingPrice);
    }

    function getLeaderboardRewardDate() external view returns (uint256, uint256) {
        return leaderboard.getDate();
    }

    // UPDATE CONTRACT

    function setInternalDependencies(address[] _newDependencies) public onlyOwner {
        super.setInternalDependencies(_newDependencies);

        dragonCore = DragonCore(_newDependencies[0]);
        dragonGetter = DragonGetter(_newDependencies[1]);
        dragonGenetics = DragonGenetics(_newDependencies[2]);
        eggCore = EggCore(_newDependencies[3]);
        leaderboard = DragonLeaderboard(_newDependencies[4]);
        nest = Nest(_newDependencies[5]);
    }
}
