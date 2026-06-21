using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;

internal static class YouthLeagueLauncher
{
    private static Process mysqlProcess;
    private static string projectRootForShutdown;
    private static string nodePathForShutdown;
    private static int dbPortForShutdown;
    private static string dbPasswordForShutdown;
    private static bool cleanupAlreadyRan;

    private static int Main()
    {
        try
        {
            return Run();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("启动器异常类型: " + ex.GetType().FullName);
            Console.Error.WriteLine("启动器异常信息: " + ex.Message);
            PauseBeforeExit();
            return 1;
        }
    }

    private static int Run()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "团委办公系统启动器";

        string projectRoot = FindProjectRoot();
        string serverFile = Path.Combine(projectRoot, "backend", "server.js");
        string packageFile = Path.Combine(projectRoot, "package.json");

        PrintHeader(projectRoot);

        if (!File.Exists(packageFile) || !File.Exists(serverFile))
        {
            Fail("没有在启动器所在目录找到项目文件。请把 exe 放在项目根目录后再启动。");
            return 1;
        }

        EnsureEnvFile(projectRoot);

        string portText = ReadEnvValue(projectRoot, "PORT", "3000");
        int port = ParsePort(portText);
        string url = "http://localhost:" + port + "/";

        string nodePath = FindNodeExecutable(projectRoot);
        if (nodePath == null)
        {
            Fail("没有找到 node.exe。请先安装 Node.js，或把 node.exe 放到 tools\\nodejs\\node.exe。");
            return 1;
        }

        if (!StartPortableDatabase(projectRoot))
        {
            return 1;
        }
        projectRootForShutdown = projectRoot;
        nodePathForShutdown = nodePath;

        if (!RunDatabaseInit(nodePath, projectRoot))
        {
            ShutdownPortableDatabase();
            return 1;
        }

        if (IsPortOpen("127.0.0.1", port, 600))
        {
            Console.WriteLine("检测到系统已经在运行，正在打开浏览器...");
            OpenBrowser(url);
            ShutdownPortableDatabase();
            return 0;
        }

        if (!Directory.Exists(Path.Combine(projectRoot, "node_modules")))
        {
            Console.WriteLine("提示：未检测到 node_modules，如启动失败，请先在项目目录执行 npm install。");
        }

        Console.WriteLine("使用 Node: " + nodePath);
        Console.WriteLine("启动地址: " + url);
        Console.WriteLine("关闭本窗口会停止本地服务。");
        Console.WriteLine();

        Thread opener = new Thread(delegate() { WaitForServerAndOpenBrowser(url, port); });
        opener.IsBackground = true;
        opener.Start();

        int exitCode = StartNodeServer(nodePath, serverFile, projectRoot);
        RunDataCleanup(nodePath, projectRoot);
        ShutdownPortableDatabase();
        return exitCode;
    }

    private static void PrintHeader(string projectRoot)
    {
        Console.WriteLine("========================================");
        Console.WriteLine("  计算机学院团委办公系统 一键启动器");
        Console.WriteLine("========================================");
        Console.WriteLine("项目目录: " + projectRoot);
        Console.WriteLine();
    }

    private static int StartNodeServer(string nodePath, string serverFile, string projectRoot)
    {
        Process process = new Process();
        process.StartInfo.FileName = nodePath;
        process.StartInfo.Arguments = Quote(serverFile);
        process.StartInfo.WorkingDirectory = projectRoot;
        process.StartInfo.UseShellExecute = false;
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
        process.StartInfo.CreateNoWindow = false;
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null)
            {
                Console.WriteLine(e.Data);
            }
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null)
            {
                Console.Error.WriteLine(e.Data);
            }
        };

        try
        {
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();

            Console.WriteLine();
            Console.WriteLine("服务已退出，退出码: " + process.ExitCode);
            PauseBeforeExit();
            return process.ExitCode;
        }
        catch (Exception ex)
        {
            Fail("启动失败: " + ex.Message);
            return 1;
        }
    }

    private static bool StartPortableDatabase(string projectRoot)
    {
        string mysqlRoot = Path.Combine(projectRoot, "mysql");
        string mysqldPath = Path.Combine(mysqlRoot, "bin", "mysqld.exe");

        if (!File.Exists(mysqldPath))
        {
            WarnIfDatabaseLooksStopped(projectRoot);
            return true;
        }

        string host = ReadEnvValue(projectRoot, "DB_HOST", "127.0.0.1");
        int dbPort = ParsePort(ReadEnvValue(projectRoot, "DB_PORT", "3307"));
        string dbPassword = ReadEnvValue(projectRoot, "DB_PASSWORD", "123456");

        if (host != "localhost" && host != "127.0.0.1")
        {
            Console.WriteLine("数据库配置为远程地址，跳过便携 MySQL 启动: " + host);
            return true;
        }

        projectRootForShutdown = projectRoot;
        nodePathForShutdown = FindNodeExecutable(projectRoot);
        dbPortForShutdown = dbPort;
        dbPasswordForShutdown = dbPassword;
        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e)
        {
            RunDataCleanup(nodePathForShutdown, projectRootForShutdown);
            ShutdownPortableDatabase();
        };
        AppDomain.CurrentDomain.ProcessExit += delegate(object sender, EventArgs e)
        {
            RunDataCleanup(nodePathForShutdown, projectRootForShutdown);
            ShutdownPortableDatabase();
        };

        if (IsPortOpen("127.0.0.1", dbPort, 600))
        {
            Console.WriteLine("检测到 MySQL 端口 " + dbPort + " 已在运行，继续使用该数据库。");
            return true;
        }

        string dataDir = GetPortableMySqlDataDir(projectRoot);
        string initFlag = Path.Combine(dataDir, ".initialized");

        if (!Directory.Exists(dataDir) || !Directory.Exists(Path.Combine(dataDir, "mysql")))
        {
            Console.WriteLine("首次运行，正在初始化本地 MySQL 数据目录...");
            if (!Directory.Exists(dataDir))
            {
                try
                {
                    Directory.CreateDirectory(dataDir);
                }
                catch (Exception ex)
                {
                    Fail("无法创建本地数据库目录: " + dataDir + Environment.NewLine +
                        "原因: " + ex.Message + Environment.NewLine +
                        "可以尝试以管理员身份运行，或在 .env 中设置 MYSQL_DATA_DIR 为一个可写的英文路径。");
                    return false;
                }
            }
            else if (Directory.GetFileSystemEntries(dataDir).Length > 0)
            {
                Fail("检测到未完成初始化的 MySQL 数据目录，请删除 runtime\\mysql-data 后重试。");
                return false;
            }

            int initCode = RunProcess(mysqldPath, BuildMySqlCommonArgs(dataDir, dbPort) + " --initialize-insecure --console", projectRoot, true);
            if (initCode != 0)
            {
                Fail("MySQL 初始化失败，请检查路径权限或换到纯英文路径后重试。");
                return false;
            }
        }

        Console.WriteLine("正在启动本地 MySQL...");
        mysqlProcess = StartBackgroundProcess(mysqldPath, BuildMySqlCommonArgs(dataDir, dbPort) + " --console", projectRoot);

        if (!WaitForPort("127.0.0.1", dbPort, 60))
        {
            Fail("MySQL 启动超时。");
            return false;
        }

        if (!File.Exists(initFlag))
        {
            Console.WriteLine("正在设置本地 MySQL 密码...");
            string mysqlPath = Path.Combine(mysqlRoot, "bin", "mysql.exe");
            string sql = "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '" + EscapeSql(dbPassword) + "'; FLUSH PRIVILEGES;";
            int passwordCode = RunProcess(mysqlPath, "--host=127.0.0.1 --port=" + dbPort + " --user=root --protocol=tcp --execute=" + Quote(sql), projectRoot, true);
            if (passwordCode != 0)
            {
                Fail("MySQL 密码设置失败。");
                return false;
            }

            File.WriteAllText(initFlag, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), Encoding.UTF8);
        }

        Console.WriteLine("本地 MySQL 已就绪。");
        return true;
    }

    private static bool RunDatabaseInit(string nodePath, string projectRoot)
    {
        string initScript = Path.Combine(projectRoot, "database", "init.js");
        if (!File.Exists(initScript))
        {
            return true;
        }

        Console.WriteLine("正在检查并初始化数据库表...");
        int exitCode = RunProcess(nodePath, Quote(initScript), projectRoot, true);
        if (exitCode != 0)
        {
            Fail("数据库初始化失败，请查看上方错误信息。");
            return false;
        }

        Console.WriteLine("数据库检查完成。");
        return true;
    }

    private static void RunDataCleanup(string nodePath, string projectRoot)
    {
        if (cleanupAlreadyRan || String.IsNullOrEmpty(nodePath) || String.IsNullOrEmpty(projectRoot))
        {
            return;
        }

        string cleanupScript = Path.Combine(projectRoot, "database", "clearRuntimeData.js");
        if (!File.Exists(cleanupScript))
        {
            return;
        }

        cleanupAlreadyRan = true;
        Console.WriteLine();
        Console.WriteLine("正在清空本次运行产生的任务、提交记录和上传文件...");
        int exitCode = RunProcess(nodePath, Quote(cleanupScript), projectRoot, true);
        if (exitCode == 0)
        {
            Console.WriteLine("运行数据已清空，账号和部门已保留。");
        }
        else
        {
            Console.WriteLine("运行数据清空失败，请稍后手动执行 npm run clear-data。");
        }
    }

    private static string GetPortableMySqlDataDir(string projectRoot)
    {
        string configured = ReadEnvValue(projectRoot, "MYSQL_DATA_DIR", "");
        if (!String.IsNullOrWhiteSpace(configured))
        {
            return Environment.ExpandEnvironmentVariables(configured);
        }

        string programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        return Path.Combine(programData, "YouthLeagueOfficePortable", "mysql-data");
    }

    private static string BuildMySqlCommonArgs(string dataDir, int dbPort)
    {
        return "--no-defaults" +
            " --basedir=mysql" +
            " --datadir=" + Quote(dataDir) +
            " --port=" + dbPort +
            " --bind-address=127.0.0.1" +
            " --character-set-server=utf8mb4" +
            " --collation-server=utf8mb4_unicode_ci" +
            " --default-authentication-plugin=mysql_native_password";
    }

    private static Process StartBackgroundProcess(string fileName, string arguments, string workingDirectory)
    {
        Process process = new Process();
        process.StartInfo.FileName = fileName;
        process.StartInfo.Arguments = arguments;
        process.StartInfo.WorkingDirectory = workingDirectory;
        process.StartInfo.UseShellExecute = false;
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
        process.StartInfo.CreateNoWindow = true;
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null && e.Data.IndexOf("ready for connections", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                Console.WriteLine("MySQL: ready for connections");
            }
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null && e.Data.IndexOf("error", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                Console.Error.WriteLine(e.Data);
            }
        };
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static int RunProcess(string fileName, string arguments, string workingDirectory, bool printOutput)
    {
        Process process = new Process();
        process.StartInfo.FileName = fileName;
        process.StartInfo.Arguments = arguments;
        process.StartInfo.WorkingDirectory = workingDirectory;
        process.StartInfo.UseShellExecute = false;
        process.StartInfo.RedirectStandardOutput = true;
        process.StartInfo.RedirectStandardError = true;
        process.StartInfo.CreateNoWindow = true;

        StringBuilder output = new StringBuilder();
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null)
            {
                output.AppendLine(e.Data);
                if (printOutput)
                {
                    Console.WriteLine(e.Data);
                }
            }
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null)
            {
                output.AppendLine(e.Data);
                if (printOutput)
                {
                    Console.Error.WriteLine(e.Data);
                }
            }
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        process.WaitForExit();
        return process.ExitCode;
    }

    private static void ShutdownPortableDatabase()
    {
        if (String.IsNullOrEmpty(projectRootForShutdown) || mysqlProcess == null)
        {
            return;
        }

        try
        {
            if (!mysqlProcess.HasExited)
            {
                string mysqlAdminPath = Path.Combine(projectRootForShutdown, "mysql", "bin", "mysqladmin.exe");
                if (File.Exists(mysqlAdminPath))
                {
                    RunProcess(
                        mysqlAdminPath,
                        "--host=127.0.0.1 --port=" + dbPortForShutdown + " --user=root --password=" + Quote(dbPasswordForShutdown) + " --protocol=tcp shutdown",
                        projectRootForShutdown,
                        false
                    );
                }

                if (!mysqlProcess.WaitForExit(5000))
                {
                    mysqlProcess.Kill();
                }
            }
        }
        catch
        {
        }
        finally
        {
            mysqlProcess = null;
        }
    }

    private static string FindProjectRoot()
    {
        string baseDir = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
        string currentDir = Path.GetFullPath(Environment.CurrentDirectory);
        string parentDir = Directory.GetParent(baseDir) != null ? Directory.GetParent(baseDir).FullName : baseDir;

        string[] candidates = new string[] { baseDir, currentDir, parentDir };
        for (int i = 0; i < candidates.Length; i++)
        {
            if (File.Exists(Path.Combine(candidates[i], "package.json")) &&
                File.Exists(Path.Combine(candidates[i], "backend", "server.js")))
            {
                return candidates[i];
            }
        }

        return baseDir;
    }

    private static string FindNodeExecutable(string projectRoot)
    {
        string[] localCandidates = new string[]
        {
            Path.Combine(projectRoot, "runtime", "nodejs", "node.exe"),
            Path.Combine(projectRoot, "nodejs", "node.exe"),
            Path.Combine(projectRoot, "tools", "nodejs", "node.exe")
        };

        for (int i = 0; i < localCandidates.Length; i++)
        {
            if (File.Exists(localCandidates[i]))
            {
                return localCandidates[i];
            }
        }

        string pathNode = FindOnPath("node.exe");
        if (pathNode != null)
        {
            return pathNode;
        }

        string[] commonCandidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe")
        };

        for (int i = 0; i < commonCandidates.Length; i++)
        {
            if (File.Exists(commonCandidates[i]))
            {
                return commonCandidates[i];
            }
        }

        return null;
    }

    private static string FindOnPath(string fileName)
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        string[] parts = path.Split(Path.PathSeparator);
        for (int i = 0; i < parts.Length; i++)
        {
            if (parts[i].Length == 0)
            {
                continue;
            }

            string candidate = Path.Combine(parts[i], fileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static void EnsureEnvFile(string projectRoot)
    {
        string envFile = Path.Combine(projectRoot, ".env");
        if (File.Exists(envFile))
        {
            return;
        }

        string jwtSecret = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        string content =
            "NODE_ENV=development" + Environment.NewLine +
            "DB_HOST=127.0.0.1" + Environment.NewLine +
            "DB_PORT=3307" + Environment.NewLine +
            "DB_USER=root" + Environment.NewLine +
            "DB_PASSWORD=123456" + Environment.NewLine +
            "DB_NAME=youth_league" + Environment.NewLine +
            "PORT=3000" + Environment.NewLine +
            "JWT_SECRET=" + jwtSecret + Environment.NewLine +
            "CORS_ORIGIN=http://localhost:3000" + Environment.NewLine +
            "MAX_FILE_SIZE=10485760" + Environment.NewLine;

        File.WriteAllText(envFile, content, Encoding.UTF8);
        Console.WriteLine("已生成本地 .env 配置。");
    }

    private static void WarnIfDatabaseLooksStopped(string projectRoot)
    {
        string host = ReadEnvValue(projectRoot, "DB_HOST", "localhost");
        string portText = ReadEnvValue(projectRoot, "DB_PORT", "3306");
        int port = ParsePort(portText);

        if (host == "localhost" || host == "127.0.0.1")
        {
            if (!IsPortOpen("127.0.0.1", port, 400))
            {
                Console.WriteLine("提示：未检测到本机 MySQL 端口 " + port + "，如登录失败请先启动 MySQL。");
            }
        }
    }

    private static string ReadEnvValue(string projectRoot, string key, string fallback)
    {
        string envFile = Path.Combine(projectRoot, ".env");
        if (!File.Exists(envFile))
        {
            return fallback;
        }

        string[] lines = File.ReadAllLines(envFile);
        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i].Trim();
            if (line.Length == 0 || line.StartsWith("#"))
            {
                continue;
            }

            int equalsIndex = line.IndexOf('=');
            if (equalsIndex <= 0)
            {
                continue;
            }

            string currentKey = line.Substring(0, equalsIndex).Trim();
            if (String.Equals(currentKey, key, StringComparison.OrdinalIgnoreCase))
            {
                return line.Substring(equalsIndex + 1).Trim().Trim('"');
            }
        }

        return fallback;
    }

    private static int ParsePort(string value)
    {
        int port;
        if (Int32.TryParse(value, out port) && port > 0 && port <= 65535)
        {
            return port;
        }

        return 3000;
    }

    private static bool IsPortOpen(string host, int port, int timeoutMs)
    {
        try
        {
            using (TcpClient client = new TcpClient())
            {
                IAsyncResult result = client.BeginConnect(host, port, null, null);
                bool success = result.AsyncWaitHandle.WaitOne(timeoutMs);
                if (!success)
                {
                    return false;
                }

                client.EndConnect(result);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool WaitForPort(string host, int port, int seconds)
    {
        for (int i = 0; i < seconds * 2; i++)
        {
            if (IsPortOpen(host, port, 500))
            {
                return true;
            }

            Thread.Sleep(500);
        }

        return false;
    }

    private static void WaitForServerAndOpenBrowser(string url, int port)
    {
        for (int i = 0; i < 60; i++)
        {
            if (IsPortOpen("127.0.0.1", port, 500))
            {
                Thread.Sleep(800);
                Console.WriteLine("服务已启动，正在打开浏览器...");
                OpenBrowser(url);
                return;
            }

            Thread.Sleep(500);
        }

        Console.WriteLine("服务启动较慢，请稍后手动访问: " + url);
    }

    private static void OpenBrowser(string url)
    {
        try
        {
            Process.Start(url);
        }
        catch
        {
            try
            {
                Process.Start("cmd.exe", "/c start \"\" " + Quote(url));
            }
            catch
            {
                Console.WriteLine("无法自动打开浏览器，请手动访问: " + url);
            }
        }
    }

    private static void Fail(string message)
    {
        Console.Error.WriteLine(message);
        PauseBeforeExit();
    }

    private static void PauseBeforeExit()
    {
        Console.WriteLine();
        Console.WriteLine("按 Enter 退出...");
        Console.ReadLine();
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static string EscapeSql(string value)
    {
        return value.Replace("\\", "\\\\").Replace("'", "''");
    }
}
