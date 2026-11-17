setenv REPO_TOP `realpath ./../../`
setenv CMOD_HOME `realpath ./cmod/`
setenv HLS_HOME `realpath ./hls/`
setenv AWS_F2_HOME `realpath ./../aws_f2/`

echo "REPO_TOP is set to "`realpath $REPO_TOP`
echo "CMOD_HOME is set to "`realpath $CMOD_HOME`
echo "HLS_HOME is set to "`realpath $HLS_HOME`
echo "AWS_F2_HOME is set to "`realpath $AWS_F2_HOME`

module load ./.catapult_modules
setenv VG_GNU_PACKAGE /cad/synopsys/vcs_gnu_package/S-2021.09/gnu_9/linux
source /cad/synopsys/vcs_gnu_package/S-2021.09/gnu_9/linux/source_me.csh
