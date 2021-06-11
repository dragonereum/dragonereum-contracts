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
    uint256 interval;
    uint256 minPrice;
    uint256 maxPrice;
    uint256 priceDropDuration;

    uint256 constant PRICE_INCREASE = 161803398875;
    uint256 constant PRICE_MULTIPLIER = 100000000000;
    uint256 constant NUMBER_OF_DRAGON_TYPES = 5; // [0..4]

    constructor() public {
        releasedAmount = 256; // released amount of eggs
        restAmount = releasedAmount;
        lastBlock = block.number; // start block number
        interval = 1; // in blocks
        priceDropDuration = 100; // in blocks
        minPrice = 10 finney; // 10 * 0.001 Eth = 0.01 Eth
        maxPrice = 10 finney;
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

    function buy(uint8 _requestedType, uint256 _value) external payable onlyController returns (uint256, uint256, uint256) {
        require(restAmount > 0, "eggs are over");
        require(lastBlock.add(interval) <= block.number, "too early");
        price = getCurrentPrice();
        require(price <= _value, "not enough ether");

        uint256 _index = releasedAmount.sub(restAmount); // next egg index
        uint8 currentType = (_index % NUMBER_OF_DRAGON_TYPES).toUint8();

        require(currentType == _requestedType, "not a current type of dragon");
        restAmount = restAmount.sub(1);
        maxPrice = price.mul(PRICE_INCREASE).div(PRICE_MULTIPLIER);
        lastBlock = block.number;

        return (restAmount, lastBlock, interval);
    }

    function getCurrentPrice() public view returns (uint256) {
        uint256 _interval = maxPrice.sub(minPrice);

        if (_interval == 0 || block.number >= lastBlock.add(priceDropDuration)) {
            return minPrice;
        }

        return maxPrice.sub(block.number.sub(lastBlock).mul(_interval.div(priceDropDuration)));
    }
}
