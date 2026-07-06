计算机学院团委办公系统 便携版

使用方法：

1. 解压整个 youth-league-office-portable 文件夹。
2. 双击 YouthLeagueLauncher.exe。
3. 等待浏览器自动打开 http://localhost:3000/。
4. 关闭启动器窗口会停止网站服务和本地 MySQL。

数据说明：

- 数据库保存在本机 C:\ProgramData\YouthLeagueOfficePortable\mysql-data 中。
- 上传文件保存在本文件夹的 uploads 中。
- 不依赖原电脑，也不会连接原电脑数据库。
- 如果要完整备份，需要同时备份便携版文件夹和 C:\ProgramData\YouthLeagueOfficePortable。

默认账号（仅用于首次登录，登录后请立即修改密码）：

- secretary / 123456
- vice / 123456
- bgs / 123456
- zzb / 123456
- xcb / 123456
- zysjb / 123456
- branch / 123456

⚠️  安全提醒（务必阅读）：

- 以上账号密码均为初始弱口令 123456，任何拿到本便携包的人都知道。
- 首次登录后请立即通过系统右上角入口修改密码，新密码需同时包含字母和数字，至少 6 位。
- 共用电脑场景下，使用完毕务必点击"退出登录"，系统会使当前账号的所有登录态立即失效。
- 如长期使用，建议定期修改密码，并仅将便携包发放给实际需要使用的内部人员。

注意：

- 不要只发送 YouthLeagueLauncher.exe，必须发送整个便携版文件夹或 zip 压缩包。
- 如果 3000 端口被占用，可以修改 .env 里的 PORT。
- 如果 3307 端口被占用，可以修改 .env 里的 DB_PORT。
- 如果提示无法创建数据库目录，可以用管理员身份运行，或把 .env 里的 MYSQL_DATA_DIR 改成一个可写的英文路径。
