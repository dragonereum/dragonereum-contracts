## How to use with Truffle

### Installation
```bash
npm install @dragonereum/contracts
```

### Usage example
```js
import contract from 'truffle-contract';

import Getter from '@dragonereum/contracts/dist/Getter.json';
// or
import { Getter } from '@dragonereum/contracts';

const getter = contract(Getter);

getter.setProvider(window.ethereum);
```

## How to run tests
```bash
npm run test
```
