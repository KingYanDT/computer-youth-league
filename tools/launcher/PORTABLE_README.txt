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

默认账号：

- secretary / 123456
- vice / 123456
- bgs / 123456
- zzb / 123456
- xcb / 123456
- zysjb / 123456
- branch / 123456

注意：

- 不要只发送 YouthLeagueLauncher.exe，必须发送整个便携版文件夹或 zip 压缩包。
- 如果 3000 端口被占用，可以修改 .env 里的 PORT。
- 如果 3307 端口被占用，可以修改 .env 里的 DB_PORT。
- 如果提示无法创建数据库目录，可以用管理员身份运行，或把 .env 里的 MYSQL_DATA_DIR 改成一个可写的英文路径。
