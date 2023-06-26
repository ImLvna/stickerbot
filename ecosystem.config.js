module.exports = {
    apps: [{
        name: "emojibot",
        script: "./out/index.js",
        log_file: "emojibot.log",
    }],

    deploy: {
        server: {
            user: "luna",
            host: "dad.lvna.me",
            ref: "origin/main",
            repo: "git@github.com:imlvna/stickerbot.git",
            path: "/home/luna/servers/stickerbot",
            "post-deploy": "yarn install && yarn build && pm2 startOrRestart ecosystem.config.js"
        }
    }
}