#!/usr/bin/groovy
def ci (){
    stage('build'){
        sh 'npm install'
    }
    stage('unit test'){
        sh './run_unit_tests.sh'
    }
    stage('functional test'){
        sh './run_functional_tests.sh'
    }
}

def cd (b){
    stage('fix git repo'){
        sh './fix-git-repo.sh'
    }

    stage('build'){
        sh 'npm install'
        sh 'npm run build'
    }

    stage('unit test'){
        sh './run_unit_tests.sh'
    }

    stage('functional test'){
        sh './run_functional_tests.sh'
    }

    stage('release'){
        def published = npmReleaseOpenfact{
            branch = b
        }
        return published
    }
}

def updateDownstreamProjects(v){
    pushPackageJSONChangePR{
        propertyName = 'ngo-login-client'
        projects = [
                'openfact-ui/openfact-npm-dependencies'
        ]
        version = v
        containerName = 'ui'
        autoMerge = true
    }
}

def npmReleaseOpenfact(body) {
    // evaluate the body block, and collect configuration into the object
    def config = [:]
    body.resolveStrategy = Closure.DELEGATE_FIRST
    body.delegate = config
    body()

    def gitEmail = config.gitEmail ?: 'fabric8-admin@googlegroups.com'
    def gitUserName = config.gitUserName ?: 'fabric8-release'
    def branch = config.branch

    sh "git config user.email ${gitEmail}"
    sh "git config user.name ${gitUserName}"    

    String npmToken = readFile '/home/jenkins/.npm-token/token'
    String ghToken = readFile '/home/jenkins/.apitoken/hub'
    wrap([$class: 'MaskPasswordsBuildWrapper', varPasswordPairs: [
        [password: npmToken, var: 'NPM_PASSWORD'],
        [password: ghToken, var: 'GH_PASSWORD']]]) {

        try {
            sh """
            export NPM_TOKEN=${npmToken} 
            export GITHUB_TOKEN=${ghToken}
            export GIT_BRANCH=${branch}
            npm run semantic-release
            """
        } catch (err) {
            echo "ERROR publishing: ${err}"
            echo "No artifacts published so skip updating downstream projects"
            return false
        }
        return true
    }
}

return this
