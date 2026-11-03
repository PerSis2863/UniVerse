using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Stormfall.EditorTools
{
    /// <summary>
    /// Tools → Build Stormfall for Web: a WebGL build for the UniVerse site
    /// (apps/web/public/games/stormfall). Brotli with decompression fallback, so the files work from
    /// any static host without special Content-Encoding headers; each file stays under 25 MB.
    /// From the command line: -executeMethod Stormfall.EditorTools.StormfallWebBuild.BuildCli -out &lt;dir&gt;
    /// </summary>
    public static class StormfallWebBuild
    {
        const string ScenePath = "Assets/Stormfall/Scenes/Stormfall.unity";

        [MenuItem("Tools/Build Stormfall for Web (WebGL)", priority = 20)]
        public static void BuildMenu() => Build("Builds/WebGL");

        public static void BuildCli()
        {
            string outDir = "Builds/WebGL";
            var args = System.Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-out") outDir = args[i + 1];
            bool ok = Build(outDir);
            EditorApplication.Exit(ok ? 0 : 1);
        }

        public static bool Build(string outDir)
        {
            if (!File.Exists(ScenePath)) StormfallSceneSetup.Build();

            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.nameFilesAsHashes = false;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.template = "APPLICATION:Minimal";
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.Low);
            PlayerSettings.runInBackground = false;

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outDir,
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            });
            var s = report.summary;
            Debug.Log($"[StormfallWeb] {s.result} in {s.totalTime.TotalMinutes:F1} min, {s.totalSize / (1024f * 1024f):F1} MB, {s.totalErrors} errors → {outDir}");
            return s.result == BuildResult.Succeeded;
        }
    }
}
