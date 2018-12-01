const { Graph } = require('@dagrejs/graphlib');

const logger = require('./logger');
const dotenv = require('dotenv');


function getInternalDependencies(contract, artifacts) {
  try {
    const contractDefinition = contract.ast.nodes
      .find(({ nodeType }) => nodeType === 'ContractDefinition');
    const setInternalDependencies = contractDefinition.nodes.find(({ nodeType, name }) =>
      nodeType === 'FunctionDefinition' && name === 'setInternalDependencies');

    if (setInternalDependencies) {
      return setInternalDependencies.body.statements.reduce((acc, statement) => {
        if (statement.nodeType === 'ExpressionStatement') {
          const { typeString } = statement.expression.typeDescriptions;

          if (typeString.startsWith('contract')) {
            return [...acc, typeString.replace(/^contract\s+/, '')];
          }
        }

        return acc;
      }, []);
    }

    for (const baseContract of contractDefinition.baseContracts) {
      const parent = artifacts.require(baseContract.baseName.name);
      const dependencies = getInternalDependencies(parent);

      if (dependencies && dependencies.length) {
        return dependencies;
      }
    }

    return [];
  } catch (e) {
    return [];
  }
}

async function createDependenciesGraph(contracts) {
  const g = new Graph();

  contracts.forEach(([contract, dependencies]) => {
    g.setNode(contract.constructor.contractName, contract);

    if (dependencies && dependencies.length) {
      dependencies.forEach(dependency =>
        g.setEdge(contract.constructor.contractName, dependency.constructor.contractName));
    }
  });

  return Promise.all(contracts
    .reduce((acc, [contract, dependencies], index, array) => {
      const inEdges = g.inEdges(contract.constructor.contractName);
      let internalDependencies = '';
      let externalDependencies = '';

      if (process.env.DEBUG === 'true') {
        console.log(`Setting dependencies for: ${contract.constructor.contractName}`);
      }
      
      if (dependencies && dependencies.length) {
        acc.push(logger(
          contract.setInternalDependencies(dependencies.map(({ address }) => address), { gas: 550000 }),
          `setInternalDependencies (${index + 1}/${array.length})`
        ));

        internalDependencies = dependencies.map(({ constructor }) =>
          constructor.contractName).join(', ');
      }

      if (process.env.DEBUG === 'true') {
        console.log(`Internal: [${internalDependencies}]`);
      }

      if (inEdges && inEdges.length) {
        acc.push(logger(
          contract.setExternalDependencies(inEdges.map(({ v }) => g.node(v).address), { gas: 550000 }),
          `setExternalDependencies (${index + 1}/${array.length})`
        ));

        externalDependencies = inEdges.map(({ v }) =>
          g.node(v).constructor.contractName).join(', ');
      }

      if (process.env.DEBUG === 'true') {
        console.log(`External: [${externalDependencies}]\n`);
      }

      return acc;
    }, []));
}

async function resolveDependencies(contracts, artifacts) {
  return createDependenciesGraph(contracts.map(contract => [
    contract,
    getInternalDependencies(contract.constructor, artifacts)
      .map(name => contracts
        .find(({ constructor: { contractName } }) =>
          name === contractName) || []),
  ]));
}

module.exports = resolveDependencies;
