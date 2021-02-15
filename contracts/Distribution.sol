pragma solidity 0.4.25;

import "./Common/Upgradable.sol";
import "./Common/SafeMath256.sol";
import "./Common/SafeConvert.sol";

contract Distribution is Upgradable {
    using SafeMath256 for uint256;
    using SafeConvert for uint256;

    uint256 restAmount;
    uint256 releasedAmount;
    uint256 lastBlock;
    uint256 interval; // in blocks

    uint256 constant NUMBER_OF_DRAGON_TYPES = 5; // [0..4]

    constructor() public {
        releasedAmount = 256; // released amount of eggs
        restAmount = releasedAmount;
        lastBlock = block.number; // start block number
        interval = 1;
    }

    function claim(uint8 _requestedType) external onlyController returns (uint256, uint256, uint256) {
        require(restAmount > 0, "eggs are over");
        require(lastBlock.add(interval) <= block.number, "too early");
        uint256 _index = releasedAmount.sub(restAmount); // next egg index
        uint8 currentType = (_index % NUMBER_OF_DRAGON_TYPES).toUint8();
        require(currentType == _requestedType, "not a current type of dragon");
        lastBlock = block.number;
        restAmount = restAmount.sub(1);
        return (restAmount, lastBlock, interval);
    }

    function getInfo() external view returns (uint256, uint256, uint256, uint256, uint256) {
        return (
            restAmount,
            releasedAmount,
            lastBlock,
            interval,
            NUMBER_OF_DRAGON_TYPES
        );
    }
}
