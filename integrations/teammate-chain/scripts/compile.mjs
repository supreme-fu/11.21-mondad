import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function compile() {
  const sources = Object.fromEntries(
    fs.readdirSync(path.join(root, 'contracts'))
      .filter((file) => file.endsWith('.sol'))
      .map((file) => [`contracts/${file}`, { content: fs.readFileSync(path.join(root, 'contracts', file), 'utf8') }]),
  );
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Conservative EVM target for local execution and portable testnet deployment.
      evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  }), {
    import: (name) => {
      const resolved = path.resolve(root, 'node_modules', name);
      if (!resolved.startsWith(path.join(root, 'node_modules') + path.sep)) return { error: 'Invalid import path' };
      try { return { contents: fs.readFileSync(resolved, 'utf8') }; }
      catch { return { error: `Missing dependency ${name}` }; }
    },
  }));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  const artifacts = {};
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  for (const [source, contracts] of Object.entries(output.contracts)) {
    if (!source.startsWith('contracts/')) continue;
    for (const [name, contract] of Object.entries(contracts)) {
      const artifact = {
        contractName: name,
        compiler: solc.version(),
        evmVersion: 'shanghai',
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
        deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
      };
      artifacts[name] = artifact;
      fs.writeFileSync(path.join(root, 'artifacts', `${name}.json`), JSON.stringify(artifact, null, 2) + '\n');
    }
  }
  return artifacts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifacts = compile();
  for (const artifact of Object.values(artifacts)) {
    console.log(`${artifact.contractName}: ${(artifact.deployedBytecode.length - 2) / 2} deployed bytes`);
  }
}
