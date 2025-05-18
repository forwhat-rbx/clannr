module.exports = {
    apps: [{
      name: "BOT",
      script: "src/main.ts",
      interpreter: "node",
      interpreter_args: "--require ts-node/register --expose-gc",
      instances: 1,
      max_memory_restart: "5G",
      env: {
        NODE_ENV: "production",
      },
    }]
  };